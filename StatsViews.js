.pragma library
.import "Stats.js" as Stats

// The stats fill's drawing, without any QML: how the panels tile a strip
// and what each panel shows, from the state and palette Stats.js makes.

// --- layout ------------------------------------------------------------------

// The dashboard's base size, its text height in pixels, for a strip of
// `width` by `height`: an eighth of the short side, within readable bounds.
function unitFor(width, height) {
  return Math.max(9, Math.min(18, Math.floor(Math.min(width, height) / 8)))
}

// Cards are about this wide for their height, and never smaller than this
// many units.
var CARD_ASPECT = 1.8
var CARD_MIN_WIDTH = 14
var CARD_MIN_HEIGHT = 6

// Units of height a card needs for its content: stacked, and wide with
// its rows beside the graphs. A card is wide past this width for its
// height.
var CARD_ROOM = 14
var WIDE_ROOM = 10
var WIDE_CARD = 2

function roomy(card, unit) {
  return card.height >= (card.width > card.height * WIDE_CARD ? WIDE_ROOM : CARD_ROOM) * unit
}

// The layout with the largest text that keeps every panel and gives each
// card room for its content: unitFor's size for a few panels, smaller for
// a crowded grid. When nothing makes room, the smallest text shows what
// fits. Returns layout's result with its `unit`.
function fit(panels, width, height) {
  // Not laid out yet: nothing to draw.
  if (!(width > 0 && height > 0)) return { unit: 9, cards: [], dropped: panels.slice() }
  for (var unit = unitFor(width, height); unit >= 9; unit--) {
    var grid = layout(panels, width, height, unit)
    if (grid.dropped.length) continue
    if (grid.cards.every(function(card) { return roomy(card, unit) })) return { unit: unit, cards: grid.cards, dropped: grid.dropped }
  }
  var fallback = layout(panels, width, height, 9)
  return { unit: 9, cards: fallback.cards, dropped: fallback.dropped }
}

// Where each of `panels` goes on a `width` by `height` strip with text
// `unit` pixels high: a grid with a unit of margin and gap, the columns and
// rows picked for the largest cards near CARD_ASPECT, a short last row
// stretched across. Panels that do not fit even one to a card are dropped
// from the end. Returns { cards: [{ panel, x, y, width, height }], dropped }.
function layout(panels, width, height, unit) {
  var gap = unit
  var innerWidth = width - 2 * unit, innerHeight = height - 2 * unit
  for (var count = panels.length; count > 0; count--) {
    var best = null
    for (var columns = 1; columns <= count; columns++) {
      var rows = Math.ceil(count / columns)
      var cardWidth = (innerWidth - gap * (columns - 1)) / columns
      var cardHeight = (innerHeight - gap * (rows - 1)) / rows
      if (cardWidth < CARD_MIN_WIDTH * unit || cardHeight < CARD_MIN_HEIGHT * unit) continue
      var score = Math.min(cardWidth, cardHeight * CARD_ASPECT)
      if (!best || score > best.score) best = { score: score, columns: columns, rows: rows, height: cardHeight }
    }
    if (!best) continue
    var cards = []
    for (var i = 0; i < count; i++) {
      var row = Math.floor(i / best.columns)
      var inRow = row === best.rows - 1 ? count - row * best.columns : best.columns
      var w = (innerWidth - gap * (inRow - 1)) / inRow
      cards.push({
        panel: panels[i],
        x: unit + (i % best.columns) * (w + gap),
        y: unit + row * (best.height + gap),
        width: w,
        height: best.height
      })
    }
    return { cards: cards, dropped: panels.slice(count) }
  }
  return { cards: [], dropped: panels.slice() }
}

// --- views -------------------------------------------------------------------

var ICONS = {
  gpu: "\u{f08ae}", igpu: "\u{f08ae}", temps: "\u{f050f}", battery: "\u{f0079}", media: "\u{f075a}", system: "\u{f02fd}", cpu: "\u{f061a}", memory: "\u{f035b}", network: "\u{f0200}",
  disks: "\u{f02ca}", processes: "\u{f0279}", pressure: "\u{f029a}", fans: "\u{f0210}"
}
var TITLES = { gpu: "GPU", igpu: "iGPU", temps: "Temperatures", battery: "Battery", media: "Now playing", system: "System", cpu: "CPU", memory: "Memory", network: "Network", disks: "Disks", processes: "Processes", pressure: "Pressure", fans: "Fans" }

function row(label, text, fraction, color) {
  return { label: label, text: text, fraction: fraction === null || fraction === undefined ? null : Math.max(0, Math.min(1, fraction)), color: color || "" }
}

// MPRIS art URLs come from players (and, for browser players, pages). Qt's
// Image accepts network URLs, so only local artwork belongs in this panel.
function localArtwork(url) {
  var value = String(url || "")
  return value.length <= 4096 && /^file:\/\/\/[^/\\\x00-\x1f]/.test(value) && !/[\\\x00-\x1f]/.test(value) ? value : ""
}

// A graph's top: its largest value, at least `floor`.
function graphMax(values, floor) {
  return Math.max.apply(null, [floor].concat(values))
}

// What one panel shows, ready to draw: a title with an icon and the box's
// color, an optional big value with a caption, graphs, per-core bars,
// label/value rows with meters and ranked lists. `empty` replaces the
// content with a message. `room` is how many rows the card has space for,
// for panels whose lists can grow to fill it, and `wide` whether its rows
// sit beside the headline rather than under it.
function view(panel, state, palette, room, wide, span) {
  var g = palette.gradients
  var result = {
    title: TITLES[panel] || panel, icon: ICONS[panel] || "", color: palette.boxes[panel] || palette.accent,
    info: "", value: "", valueColor: palette.foreground, caption: "",
    graphs: [], bars: [], rows: [], lists: [], empty: "", logo: false
  }
  var build = VIEWS[panel]
  if (build) build(result, state, palette, g, room, wide, span)
  if (room !== undefined) result.rows = result.rows.slice(0, rowsThatFit(result, room, wide))
  return result
}

// Rows' room each part of a stacked card's headline takes: the big value,
// a graph at its smallest, the per-core bars, and the gap below them. A
// row is a line of text and its spacing.
var VALUE_ROWS = 1.8
var GRAPH_ROWS = 1
var BARS_ROWS = 1.4
var GAP_ROWS = 0.3

// How many of a view's rows fit `room` rows: all of it beside the headline
// in a wide card, what the headline leaves in a stacked one. Rows that would be cut in half are left
// out, and whatever room is over goes to the graphs.
function rowsThatFit(v, room, wide) {
  if (wide) return Math.max(0, room)
  var headline = (v.value ? VALUE_ROWS : 0) + v.graphs.length * GRAPH_ROWS + (v.bars.length ? BARS_ROWS : 0)
  if (headline > 0) headline += GAP_ROWS
  return Math.max(0, Math.floor(room - headline + 1e-9))
}

// The rows of a GPU panel for one GPU, whichever its vendor: load with
// its `history`, then every reading it has.
function gpuView(v, gpu, history, g, room, wide) {
  v.info = gpu.name
  if (gpu.asleep) { v.empty = "Asleep"; return }
  v.value = Stats.formatPercent(gpu.load)
  v.valueColor = Stats.gradientAt(g.cpu, (gpu.load || 0) / 100)
  v.caption = gpu.resting ? "idle" : "load"
  v.graphs.push({ values: history, max: 100, stops: g.cpu, label: "" })
    if (gpu.memUsed !== null && gpu.memTotal) v.rows.push(row("VRAM", Stats.formatPair(gpu.memUsed, gpu.memTotal), gpu.memUsed / gpu.memTotal, Stats.gradientAt(g.used, gpu.memUsed / gpu.memTotal)))
  if (gpu.temp !== null) v.rows.push(row("Temp", Stats.formatTemp(gpu.temp), gpu.temp / 100, Stats.gradientAt(g.temp, gpu.temp / 100)))
  if (gpu.power !== null) {
    var limit = gpu.powerLimit
    v.rows.push(row("Power", limit ? watts(gpu.power) + " / " + watts(limit) + " W" : watts(gpu.power) + " W",
      limit ? gpu.power / limit : null, limit ? Stats.gradientAt(g.temp, gpu.power / limit) : ""))
  }
  if (gpu.clock !== null) v.rows.push(row("Clock", Stats.formatFrequency(gpu.clock), null))
  if (gpu.fan !== null) v.rows.push(row("Fan", Stats.formatPercent(gpu.fan), gpu.fan / 100, Stats.gradientAt(g.cpu, gpu.fan / 100)))
  if (gpu.encoder) v.rows.push(row("Encode", Stats.formatPercent(gpu.encoder), gpu.encoder / 100, Stats.gradientAt(g.cpu, gpu.encoder / 100)))
  if (gpu.decoder) v.rows.push(row("Decode", Stats.formatPercent(gpu.decoder), gpu.decoder / 100, Stats.gradientAt(g.cpu, gpu.decoder / 100)))
}

// Units of width under which a disk's row leaves out its temperature.
var DISK_TEMP_SPAN = 26

// Watts, with a decimal below 10: an iGPU draws fractions of one.
function watts(value) {
  return value < 10 ? value.toFixed(1) : String(Math.round(value))
}

var VIEWS = {
  gpu: function(v, state, palette, g, room, wide) {
    var gpu = Stats.gpuRoles(state).main
    if (!gpu) { v.empty = state.time !== null && state.nvidiaMissing ? "No GPU found" : "Waiting for data"; return }
    gpuView(v, gpu, state.history.gpu, g, room, wide)
  },

  igpu: function(v, state, palette, g, room, wide) {
    var roles = Stats.gpuRoles(state)
    if (roles.integrated) gpuView(v, roles.integrated, state.history.igpu, g, room, wide)
    else v.empty = roles.main && roles.main.kind === "integrated" ? "Shown as GPU" : "No integrated GPU"
  },
  cpu: function(v, state, palette, g) {
    var cpu = state.cpu
    v.info = cpu.threads ? cpu.threads + " threads" : ""
    v.value = Stats.formatPercent(cpu.total)
    v.valueColor = Stats.gradientAt(g.cpu, (cpu.total || 0) / 100)
    // The clock rides beside the load, so the power draw can have its row.
    v.caption = cpu.frequency !== null ? "load · " + Stats.formatFrequency(cpu.frequency) : "load"
    v.graphs.push({ values: state.history.cpu, max: 100, stops: g.cpu, label: "" })
    v.bars = cpu.cores.map(function(load) { return { fraction: load / 100, color: Stats.gradientAt(g.cpu, load / 100) } })
    // The power first: the Temperatures panel has the temperature too.
    if (cpu.power !== null) {
      // Against the CPU's limit, blue to red, when it is known.
      var limit = Stats.cpuPowerLimit((state.sysinfo || {}).cpu, cpu.powerLimit)
      var used = limit ? Math.min(1, cpu.power / limit) : null
      v.rows.push(row("Power", limit ? watts(cpu.power) + " / " + watts(limit) + " W" : watts(cpu.power) + " W",
        used, limit ? Stats.gradientAt(g.power, used) : ""))
    }
    if (cpu.temp !== null) v.rows.push(row("Temp", Stats.formatTemp(cpu.temp), cpu.temp / 100, Stats.gradientAt(g.temp, cpu.temp / 100)))
    if (cpu.loadavg.length) v.rows.push(row("Load", cpu.loadavg.map(function(n) { return n.toFixed(2) }).join("  "), null))
  },

  memory: function(v, state, palette, g) {
    var m = state.memory
    if (!m || !m.total) { v.empty = "Waiting for data"; return }
    var used = m.used / m.total
    v.info = Stats.formatBytes(m.total)
    v.value = Stats.formatPercent(used * 100)
    v.valueColor = Stats.gradientAt(g.used, used)
    v.caption = "used"
    v.graphs.push({ values: state.history.memory, max: 100, stops: g.used, label: "" })
    v.rows.push(row("Used", Stats.formatBytes(m.used), used, Stats.gradientAt(g.used, used)))
    v.rows.push(row("Available", Stats.formatBytes(m.available), m.available / m.total, Stats.gradientAt(g.upload, m.available / m.total)))
    v.rows.push(row("Cached", Stats.formatBytes(m.cached), m.cached / m.total, Stats.gradientAt(g.process, m.cached / m.total)))
    if (m.swapTotal) v.rows.push(row("Swap", Stats.formatPair(m.swapUsed, m.swapTotal), m.swapUsed / m.swapTotal, Stats.gradientAt(g.temp, m.swapUsed / m.swapTotal)))
  },

  network: function(v, state, palette, g) {
    var n = state.network
    if (!n.interface) { v.empty = "No network"; return }
    v.info = n.interface
    v.graphs.push({ values: state.history.rx, max: graphMax(state.history.rx, 10240), stops: g.download, label: "↓ " + Stats.formatRate(n.rx) })
    v.graphs.push({ values: state.history.tx, max: graphMax(state.history.tx, 10240), stops: g.upload, label: "↑ " + Stats.formatRate(n.tx) })
    v.rows.push(row("Received", Stats.formatBytes(n.rxTotal), null))
    v.rows.push(row("Sent", Stats.formatBytes(n.txTotal), null))
  },

  disks: function(v, state, palette, g, room, wide, span) {
    if (!state.disks.length) { v.empty = "No disks"; return }
    v.info = state.disks.length === 1 ? "1 disk" : state.disks.length + " disks"
    v.graphs.push({ values: state.history.disk, max: graphMax(state.history.disk, 1048576), stops: g.process, label: "I/O" })
    v.rows = state.disks.map(function(disk) {
      var text = "R " + Stats.formatShort(disk.read) + "  W " + Stats.formatShort(disk.write)
      // A narrow card has no room for it; the Temperatures panel has it.
      if (disk.temp !== null && !(span < DISK_TEMP_SPAN)) text += "  " + Stats.formatTemp(disk.temp)
      return row(disk.name, text, null, disk.temp !== null ? Stats.gradientAt(g.temp, disk.temp / 100) : "")
    })
  },

  processes: function(v, state, palette, g, room) {
    // The busiest five programs and three GPU apps, or as many as fill
    // `room`, which also holds a title per list; always one of each.
    var vram = state.nvidia || state.gpuApps.length
    var apps = Math.min(state.gpuApps.length, 3)
    var programs = 5
    if (room !== undefined) {
      // An empty list still takes a line, for "Nothing busy".
      if (vram) apps = Math.min(apps, Math.max(1, room - 3))
      programs = Math.max(1, room - (vram ? 2 + Math.max(1, apps) : 1))
    }
    v.lists.push({ title: "CPU", items: state.processes.slice(0, programs).map(function(p) {
      return { name: p.count > 1 ? p.name + " ×" + p.count : p.name, text: Stats.formatPercent(p.cpu), fraction: Math.min(1, p.cpu / 100), color: Stats.gradientAt(g.process, Math.min(1, p.cpu / 100)) }
    }) })
    if (vram) {
      var total = state.nvidia && state.nvidia.memTotal
      v.lists.push({ title: "VRAM", items: state.gpuApps.slice(0, apps).map(function(app) {
        var share = total ? app.memory / total : null
        return { name: app.name, text: Stats.formatBytes(app.memory), fraction: share, color: Stats.gradientAt(g.used, share || 0) }
      }) })
    }
  },

  pressure: function(v, state, palette, g) {
    var p = state.pressure
    if (!p) { v.empty = "Waiting for data"; return }
    if (p.cpu === null && p.memory === null && p.io === null) { v.empty = "Not available on this kernel"; return }
    v.info = "stalled, 10 s"
    v.graphs.push({ values: state.history.pressure, max: graphMax(state.history.pressure, 5), stops: g.temp, label: "" })
    ;[["CPU", p.cpu], ["Memory", p.memory], ["I/O", p.io]].forEach(function(pair) {
      if (pair[1] === null) return
      // Stalls of a few percent already matter; the square root shows them.
      var fraction = Math.sqrt(pair[1] / 100)
      v.rows.push(row(pair[0], pair[1].toFixed(1) + "%", fraction, Stats.gradientAt(g.temp, fraction)))
    })
  },

  temps: function(v, state, palette, g, room, wide) {
    function temp(name, value) { return row(name, Stats.formatTemp(value), value / 100, Stats.gradientAt(g.temp, value / 100)) }
    var roles = Stats.gpuRoles(state)
    var cpu = state.temps.filter(function(t) { return !/^DIMM /.test(t.name) })
    var dimms = state.temps.filter(function(t) { return /^DIMM /.test(t.name) })
    v.rows = cpu.map(function(t) { return temp(t.name, t.temp) })
    if (roles.main && roles.main.temp !== null) v.rows.push(temp("GPU", roles.main.temp))
    if (roles.integrated && roles.integrated.temp !== null) v.rows.push(temp("iGPU", roles.integrated.temp))
    Object.keys(state.nvmeTemps).sort().forEach(function(controller) {
      var disk = state.disks.filter(function(d) { return d.name.indexOf(controller + "n") === 0 })[0]
      v.rows.push(temp(disk ? disk.name : controller, state.nvmeTemps[controller]))
    })
    dimms.forEach(function(t) { v.rows.push(temp(t.name, t.temp)) })
    if (state.cpu.temp !== null) {
      v.value = Stats.formatTemp(state.cpu.temp)
      v.valueColor = Stats.gradientAt(g.temp, state.cpu.temp / 100)
      v.caption = "CPU"
      v.graphs.push({ values: state.history.temp, max: 100, stops: g.temp, label: "" })
    }
    if (!v.rows.length) v.empty = "No temperature sensors"
  },

  battery: function(v, state, palette, g) {
    var laptop = state.power.filter(function(b) { return !b.device })[0]
    var devices = state.power.filter(function(b) { return b.device })
    // A peripheral may report only a level; it reads as about this full.
    var LEVELS = { Critical: 0.05, Low: 0.2, Normal: 0.6, High: 0.85, Full: 1 }
    function hours(h) { return Math.floor(h) + "h " + Math.floor(h * 60) % 60 + "m" }
    var lead = Stats.leadBattery(state.power)
    if (lead && !laptop) {
      v.value = Stats.formatPercent(lead.capacity)
      v.valueColor = Stats.gradientAt(g.temp, 1 - lead.capacity / 100)
      v.caption = lead.name
      v.graphs.push({ values: state.history.battery, max: 100, stops: g.used, label: "" })
    }
    if (laptop) {
      var cap = laptop.capacity
      v.value = Stats.formatPercent(cap)
      v.valueColor = Stats.gradientAt(g.temp, 1 - (cap || 0) / 100)
      if (laptop.status === "Discharging" && laptop.power > 0 && laptop.energy !== null) v.caption = hours(laptop.energy / laptop.power) + " left"
      else if (laptop.status === "Charging" && laptop.power > 0 && laptop.full !== null) v.caption = hours((laptop.full - laptop.energy) / laptop.power) + " to full"
      else v.caption = String(laptop.status || "").toLowerCase()
      v.graphs.push({ values: state.history.battery, max: 100, stops: g.used, label: "" })
      if (laptop.power !== null) v.rows.push(row("Power", laptop.power.toFixed(1) + " W", null))
      if (laptop.energy !== null && laptop.full) v.rows.push(row("Energy", laptop.energy.toFixed(1) + " / " + laptop.full.toFixed(1) + " Wh", null))
    }
    devices.forEach(function(d) {
      // The peripheral leading the panel is not listed again.
      if (d === lead && !laptop) return
      var fraction = d.capacity !== null ? d.capacity / 100 : LEVELS[d.level]
      v.rows.push(row(d.name, d.capacity !== null ? Stats.formatPercent(d.capacity) : d.level || "—",
        fraction === undefined ? null : fraction, Stats.gradientAt(g.temp, 1 - (fraction || 0))))
    })
    if (!laptop && !devices.length) v.empty = "No batteries"
  },

  media: function(v, state, palette, g) {
    var m = state.media
    if (!m || !m.title && !m.playing) { v.empty = "Nothing playing"; return }
    // A player that names no track (a browser tab, say) is named instead.
    v.info = m.title ? m.identity || "" : ""
    v.media = {
      title: m.title || m.identity || "Unknown player",
      artist: m.artist || "",
      album: m.album || "",
      art: localArtwork(m.art),
      playing: !!m.playing,
      progress: m.length > 0 ? Math.max(0, Math.min(1, m.position / m.length)) : null,
      // Without a length, a position (a browser's 0:00) tells nothing.
      time: m.length > 0 ? Stats.formatDuration(m.position) + " / " + Stats.formatDuration(m.length) : ""
    }
  },

  system: function(v, state, palette, g) {
    var system = state.system
    if (!system) { v.empty = "Waiting for data"; return }
    var info = state.sysinfo || {}
    v.info = info.user ? info.user + "@" + system.hostname : system.hostname
    v.logo = true
    if (system.uptime !== null) { v.value = Stats.formatUptime(system.uptime); v.caption = "up" }
    v.valueColor = palette.accent
    // In fastfetch's order, the most telling first: a small card keeps those.
    function add(label, text) { if (text) v.rows.push(row(label, text, null)) }
    add("OS", [info.os, info.omarchy].filter(Boolean).join(" "))
    add("Channel", info.channel && info.channel !== "unknown" ? info.channel : "")
    add("Host", Stats.hostName(info))
    add("Kernel", system.kernel)
    add("CPU", Stats.shortCpu(info.cpu))
    var roles = Stats.gpuRoles(state)
    if (roles.main) add("GPU", roles.main.name)
    if (roles.integrated) add("iGPU", roles.integrated.name)
    if (state.memory && state.memory.total) add("Memory", Stats.formatPair(state.memory.used, state.memory.total))
    var packages = []
    if (Number(info.packages) > 0) packages.push(info.packages + " pacman")
    if (Number(info.flatpaks) > 0) packages.push(info.flatpaks + " flatpak")
    add("Packages", packages.join(", "))
    add("Shell", info.shell)
    add("Desktop", info.desktop)
    add("Theme", Stats.themeName(info.theme))
    if (state.cpu.loadavg.length) v.rows.push(row("Load", state.cpu.loadavg.map(function(n) { return n.toFixed(2) }).join("  "), null))
    if (state.threads !== null) v.rows.push(row("Threads", String(state.threads), null))
  },

  fans: function(v, state, palette, g) {
    var gpu = Stats.gpuRoles(state).main
    if (gpu && gpu.fan !== null) {
      v.value = Stats.formatPercent(gpu.fan)
      v.valueColor = Stats.gradientAt(g.cpu, gpu.fan / 100)
      v.caption = "GPU fan"
      v.graphs.push({ values: state.history.fan || [], max: 100, stops: g.cpu, label: "" })
    }
    v.rows = state.fans.map(function(fan) {
      return row(fan.name, fan.rpm + " RPM", fan.rpm / 3000, Stats.gradientAt(g.cpu, fan.rpm / 3000))
    })
    if (gpu && gpu.fan !== null) v.rows.push(row("GPU", Stats.formatPercent(gpu.fan), gpu.fan / 100, Stats.gradientAt(g.cpu, gpu.fan / 100)))
    if (!v.rows.length) v.empty = "No fan sensors"
  }
}
