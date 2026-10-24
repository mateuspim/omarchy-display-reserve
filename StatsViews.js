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
  disks: "\u{f02ca}", processes: "\u{f0279}"
}
var TITLES = { gpu: "GPU", igpu: "iGPU", temps: "Sensors", battery: "Battery", media: "Now playing", system: "System", cpu: "CPU", memory: "Memory", network: "Network", disks: "Disks", processes: "Processes" }

function row(label, text, fraction, color) {
  return { label: label, text: text, fraction: fraction === null || fraction === undefined ? null : Math.max(0, Math.min(1, fraction)), color: color || "", swatch: false }
}

// A row with no meter whose label carries a square of `color`: the key to
// a part of the view's stacked bar.
function keyRow(label, text, color) {
  return { label: label, text: text, fraction: null, color: color, swatch: true }
}

// Where a card turns to its warning color, so trouble shows from across
// the room: a sensor this many °C from its limit, memory or video memory
// this full, tasks stalled this share of the last 10 s, a battery this low
// and draining.
var ALERT_HEAT_MARGIN = 5
var ALERT_MEMORY = 0.9
var ALERT_VRAM = 0.95
var ALERT_STALL = 10
var ALERT_BATTERY = 15

function hot(temp, limit) {
  return temp !== null && temp !== undefined && limit > 0 && temp >= limit - ALERT_HEAT_MARGIN
}

// A temperature row, its meter filling from HEAT_FLOOR to the sensor's
// limit, green through yellow to red like every level meter.
function heatRow(label, temp, limit, g) {
  var level = Stats.heat(temp, limit)
  return row(label, Stats.formatTemp(temp), level, Stats.gradientAt(g.level, level))
}

// Stalls below this share of the last 10 s are left off: a row reading
// 0.0% all day only takes room.
var STALL_SHOWN = 1

// A row for the share of the last 10 s tasks stalled on one resource
// (pressure stall information). Stalls of a few percent already matter;
// the square root shows them.
function stallRow(value, g) {
  var level = Math.sqrt(Math.min(100, value) / 100)
  return row("Stalled", value.toFixed(1) + "%", level, Stats.gradientAt(g.level, level))
}

// Units of width from which the load average names its minutes.
var LOAD_LABEL_SPAN = 26

// The 1, 5 and 15 minute load averages, a meter for the first against the
// number of threads, where a load of one per thread is a busy CPU.
function loadRow(loadavg, threads, g, span) {
  var numbers = loadavg.map(function(n) { return n.toFixed(2) })
  var text = span >= LOAD_LABEL_SPAN
    ? ["1m", "5m", "15m"].map(function(name, i) { return name + " " + numbers[i] }).join("  ")
    : numbers.join("  ")
  var level = threads > 0 ? loadavg[0] / threads : null
  return row("Load", text, level, level === null ? "" : Stats.gradientAt(g.level, level))
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
// color, an optional big value with a caption, graphs (each with an
// optional label and `peak`, the text for its top), per-core bars (a
// `gap` entry splits them into groups), a stacked bar of `stack` parts,
// label/value rows with meters and ranked lists. `alert` asks for the
// card's warning color. `empty` replaces the
// content with a message. `room` is how many rows the card has space for,
// for panels whose lists can grow to fill it, and `wide` whether its rows
// sit beside the headline rather than under it.
function view(panel, state, palette, room, wide, span) {
  var g = palette.gradients
  var result = {
    title: TITLES[panel] || panel, icon: ICONS[panel] || "", color: palette.boxes[panel] || palette.accent,
    info: "", value: "", valueColor: palette.foreground, caption: "",
    graphs: [], bars: [], stack: [], rows: [], lists: [], empty: "", logo: false, alert: false
  }
  var build = VIEWS[panel]
  if (build) build(result, state, palette, g, room, wide, span)
  if (room !== undefined) result.rows = result.rows.slice(0, rowsThatFit(result, room, wide))
  return result
}

// Rows' room each part of a stacked card's headline takes: the big value,
// a graph at its smallest, the per-core bars, the stacked bar, and the gap
// below them. A row is a line of text and its spacing.
var VALUE_ROWS = 1.8
var GRAPH_ROWS = 1
var BARS_ROWS = 1.4
var STACK_ROWS = 0.8
var GAP_ROWS = 0.3

// How many of a view's rows fit `room` rows: all of it beside the headline
// in a wide card, what the headline leaves in a stacked one. Rows that would be cut in half are left
// out, and whatever room is over goes to the graphs.
function rowsThatFit(v, room, wide) {
  if (wide) return Math.max(0, room)
  var headline = (v.value ? VALUE_ROWS : 0) + v.graphs.length * GRAPH_ROWS + (v.bars.length ? BARS_ROWS : 0) + (v.stack.length ? STACK_ROWS : 0)
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
  if (gpu.memUsed !== null && gpu.memTotal) {
    var vram = gpu.memUsed / gpu.memTotal
    v.rows.push(row("VRAM", Stats.formatPair(gpu.memUsed, gpu.memTotal), vram, Stats.gradientAt(g.level, vram)))
    if (vram >= ALERT_VRAM) v.alert = true
  }
  if (gpu.temp !== null) {
    v.rows.push(heatRow("Temp", gpu.temp, gpu.tempLimit, g))
    if (hot(gpu.temp, gpu.tempLimit)) v.alert = true
  }
  if (gpu.power !== null) {
    var limit = gpu.powerLimit
    v.rows.push(row("Power", limit ? watts(gpu.power) + " / " + watts(limit) + " W" : watts(gpu.power) + " W",
      limit ? gpu.power / limit : null, limit ? Stats.gradientAt(g.level, gpu.power / limit) : ""))
  }
  if (gpu.clock !== null) v.rows.push(row("Clock", Stats.formatFrequency(gpu.clock), null))
  if (gpu.fan !== null) v.rows.push(row("Fan", Stats.formatPercent(gpu.fan), gpu.fan / 100, Stats.gradientAt(g.level, gpu.fan / 100)))
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
  cpu: function(v, state, palette, g, room, wide, span) {
    var cpu = state.cpu
    var groups = Stats.coreGroups(state.sysinfo)
    v.info = !cpu.threads ? ""
      : groups ? groups.performance.length + " P + " + groups.efficient.length + " E threads"
      : cpu.threads + " threads"
    v.value = Stats.formatPercent(cpu.total)
    v.valueColor = Stats.gradientAt(g.cpu, (cpu.total || 0) / 100)
    // The clock rides beside the load, so the power draw can have its row.
    v.caption = cpu.frequency !== null ? "load · " + Stats.formatFrequency(cpu.frequency) : "load"
    v.graphs.push({ values: state.history.cpu, max: 100, stops: g.cpu, label: "" })
    function bar(load) { return { fraction: load / 100, color: Stats.gradientAt(g.cpu, load / 100), gap: false } }
    if (groups) {
      // A hybrid CPU's performance threads, a gap, then its efficient
      // ones: one block of identical bars would hide which kind is busy.
      var byId = {}
      cpu.coreIds.forEach(function(id, i) { byId[id] = cpu.cores[i] })
      function loads(ids) { return ids.filter(function(id) { return byId[id] !== undefined }).map(function(id) { return bar(byId[id]) }) }
      var performance = loads(groups.performance), efficient = loads(groups.efficient)
      v.bars = performance.length && efficient.length ? performance.concat([{ fraction: 0, color: "", gap: true }], efficient) : cpu.cores.map(bar)
    } else v.bars = cpu.cores.map(bar)
    // The power first: the Temperatures panel has the temperature too.
    if (cpu.power !== null) {
      // Against the CPU's limit, blue to red, when it is known.
      var limit = Stats.cpuPowerLimit((state.sysinfo || {}).cpu, cpu.powerLimit)
      var used = limit ? Math.min(1, cpu.power / limit) : null
      v.rows.push(row("Power", limit ? watts(cpu.power) + " / " + watts(limit) + " W" : watts(cpu.power) + " W",
        used, limit ? Stats.gradientAt(g.level, used) : ""))
    }
    if (cpu.temp !== null) {
      v.rows.push(heatRow("Temp", cpu.temp, cpu.tempLimit, g))
      if (hot(cpu.temp, cpu.tempLimit)) v.alert = true
    }
    if (cpu.loadavg.length) v.rows.push(loadRow(cpu.loadavg, cpu.threads, g, span))
    var stall = state.pressure && state.pressure.cpu
    if (stall !== null && stall !== undefined && stall >= STALL_SHOWN) {
      v.rows.push(stallRow(stall, g))
      if (stall >= ALERT_STALL) v.alert = true
    }
  },

  memory: function(v, state, palette, g) {
    var m = state.memory
    if (!m || !m.total) { v.empty = "Waiting for data"; return }
    var used = m.used / m.total
    v.info = Stats.formatBytes(m.total)
    v.value = Stats.formatPercent(used * 100)
    v.valueColor = Stats.gradientAt(g.used, used)
    v.caption = "used"
    if (used >= ALERT_MEMORY) v.alert = true
    // One bar for the whole of memory: what is used, the cache the kernel
    // would hand back, and what is free. Used and available add up to the
    // total, so separate meters for them said the same thing twice, and a
    // graph of used memory is a flat line.
    var cached = Math.min(m.cached, m.available)
    var colors = { used: v.color, cached: Stats.mix(v.color, palette.background, 0.55) }
    v.stack = [
      { fraction: used, color: colors.used },
      { fraction: cached / m.total, color: colors.cached }
    ]
    v.rows.push(keyRow("Used", Stats.formatBytes(m.used), colors.used))
    v.rows.push(keyRow("Cached", Stats.formatBytes(m.cached), colors.cached))
    v.rows.push(row("Available", Stats.formatBytes(m.available), null))
    if (m.swapTotal) v.rows.push(row("Swap", Stats.formatPair(m.swapUsed, m.swapTotal), m.swapUsed / m.swapTotal, Stats.gradientAt(g.level, m.swapUsed / m.swapTotal)))
    var stall = state.pressure && state.pressure.memory
    if (stall !== null && stall !== undefined && stall >= STALL_SHOWN) {
      v.rows.push(stallRow(stall, g))
      if (stall >= ALERT_STALL) v.alert = true
    }
  },

  network: function(v, state, palette, g) {
    var n = state.network
    if (!n.interface) { v.empty = "No network"; return }
    v.info = n.interface
    // Each graph scales to its own peak, which its top names: otherwise
    // 30 KiB/s and 1 GiB/s draw the same mountain.
    var rxMax = graphMax(state.history.rx, 10240), txMax = graphMax(state.history.tx, 10240)
    v.graphs.push({ values: state.history.rx, max: rxMax, stops: g.download, label: "↓ " + Stats.formatRate(n.rx), peak: Stats.formatRate(rxMax) })
    v.graphs.push({ values: state.history.tx, max: txMax, stops: g.upload, label: "↑ " + Stats.formatRate(n.tx), peak: Stats.formatRate(txMax) })
    v.rows.push(row("Since boot", "↓ " + Stats.formatBytes(n.rxTotal) + "  ↑ " + Stats.formatBytes(n.txTotal), null))
  },

  disks: function(v, state, palette, g, room, wide, span) {
    if (!state.disks.length) { v.empty = "No disks"; return }
    v.info = state.disks.length === 1 ? "1 disk" : state.disks.length + " disks"
    var diskMax = graphMax(state.history.disk, 1048576)
    v.graphs.push({ values: state.history.disk, max: diskMax, stops: g.process, label: "I/O", peak: Stats.formatRate(diskMax) })
    v.rows = state.disks.map(function(disk) {
      var text = "R " + Stats.formatShort(disk.read) + "  W " + Stats.formatShort(disk.write)
      // A narrow card has no room for it; the Sensors panel has it.
      if (disk.temp !== null && !(span < DISK_TEMP_SPAN)) text += "  " + Stats.formatTemp(disk.temp)
      if (hot(disk.temp, disk.tempLimit)) v.alert = true
      return row(disk.name, text, null)
    })
    var stall = state.pressure && state.pressure.io
    if (stall !== null && stall !== undefined && stall >= STALL_SHOWN) {
      v.rows.push(stallRow(stall, g))
      if (stall >= ALERT_STALL) v.alert = true
    }
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


  // Every sensor: the CPU's and its dies', the GPUs', NVMe drives' and
  // memory modules' temperatures, each against its own limit, then the
  // fans.
  temps: function(v, state, palette, g, room, wide) {
    function temp(name, value, limit) {
      if (hot(value, limit)) v.alert = true
      return heatRow(name, value, limit, g)
    }
    var roles = Stats.gpuRoles(state)
    var cpu = state.temps.filter(function(t) { return !/^DIMM /.test(t.name) })
    var dimms = state.temps.filter(function(t) { return /^DIMM /.test(t.name) })
    v.rows = cpu.map(function(t) { return temp(t.name, t.temp, t.limit) })
    if (roles.main && roles.main.temp !== null) v.rows.push(temp("GPU", roles.main.temp, roles.main.tempLimit))
    if (roles.integrated && roles.integrated.temp !== null) v.rows.push(temp("iGPU", roles.integrated.temp, roles.integrated.tempLimit))
    Object.keys(state.nvmeTemps).sort().forEach(function(controller) {
      var disk = state.disks.filter(function(d) { return d.name.indexOf(controller + "n") === 0 })[0]
      v.rows.push(temp(disk ? disk.name : controller, state.nvmeTemps[controller], (state.nvmeLimits || {})[controller]))
    })
    dimms.forEach(function(t) { v.rows.push(temp(t.name, t.temp, t.limit)) })
    // Fans against 3000 RPM, about as fast as a desktop's case and CPU
    // fans spin, and the GPU's in percent.
    state.fans.forEach(function(fan) {
      v.rows.push(row(fan.name, fan.rpm + " RPM", fan.rpm / 3000, Stats.gradientAt(g.level, fan.rpm / 3000)))
    })
    if (roles.main && roles.main.fan !== null) v.rows.push(row("GPU fan", Stats.formatPercent(roles.main.fan), roles.main.fan / 100, Stats.gradientAt(g.level, roles.main.fan / 100)))
    if (state.cpu.temp !== null) {
      var level = Stats.heat(state.cpu.temp, state.cpu.tempLimit)
      if (hot(state.cpu.temp, state.cpu.tempLimit)) v.alert = true
      v.value = Stats.formatTemp(state.cpu.temp)
      v.valueColor = Stats.gradientAt(g.level, level)
      v.caption = state.cpu.tempLimit ? "CPU · max " + Stats.formatTemp(state.cpu.tempLimit) : "CPU"
      v.graphs.push({ values: state.history.temp, max: state.cpu.tempLimit || 100, stops: g.level, label: "" })
    }
    if (!v.rows.length) v.empty = "No sensors"
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
      v.valueColor = Stats.gradientAt(g.level, 1 - lead.capacity / 100)
      v.caption = lead.name
      v.graphs.push({ values: state.history.battery, max: 100, stops: g.used, label: "" })
    }
    if (laptop) {
      var cap = laptop.capacity
      v.value = Stats.formatPercent(cap)
      v.valueColor = Stats.gradientAt(g.level, 1 - (cap || 0) / 100)
      if (laptop.status === "Discharging" && cap !== null && cap <= ALERT_BATTERY) v.alert = true
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
        fraction === undefined ? null : fraction, Stats.gradientAt(g.level, 1 - (fraction || 0))))
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

  system: function(v, state, palette, g, room, wide, span) {
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
    if (state.cpu.loadavg.length) v.rows.push(loadRow(state.cpu.loadavg, state.cpu.threads, g, span))
    if (state.threads !== null) v.rows.push(row("Threads", String(state.threads), null))
  }
}
