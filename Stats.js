.pragma library

// The stats fill's data, without any QML: parsing what stats.sh and
// nvidia-smi print, turning counters into rates, the theme's palette, how
// the panels tile a strip and what each panel shows.

// Samples kept for each graph.
var HISTORY = 60
// Seconds between two frames past which their counters no longer make a
// rate: the sampler was paused, or the session slept.
var GAP = 10
// Seconds between two process samples past which the same holds.
var PROCESS_GAP = 30
// Clock ticks per second in /proc/<pid>/stat (USER_HZ), 100 on Linux.
var HZ = 100
var MIB = 1048576

// --- stats.sh frames ---------------------------------------------------------

// A frame's lines by section, as { time, stat: [lines], meminfo: [...] }.
// Sections are opened by "@name" lines; "@time" carries its value.
function parseFrame(text) {
  var sections = { time: null }
  var current = null
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (line.charAt(0) === "@") {
      var parts = line.slice(1).split(" ")
      if (parts[0] === "time") { sections.time = Number(parts[1]); current = null; continue }
      if (parts[0] === "end") break
      current = sections[parts[0]] = []
    } else if (current && line !== "") {
      current.push(line)
    }
  }
  return sections
}

function ticks(line) {
  var f = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal; guest time is already
  // part of user.
  var idle = (f[3] || 0) + (f[4] || 0)
  var busy = (f[0] || 0) + (f[1] || 0) + (f[2] || 0) + (f[5] || 0) + (f[6] || 0) + (f[7] || 0)
  return { busy: busy, all: busy + idle }
}

// Busy and total ticks from /proc/stat's cpu lines.
function parseCpu(lines) {
  var result = { total: { busy: 0, all: 0 }, cores: [] }
  for (var i = 0; i < lines.length; i++) {
    if (/^cpu\s/.test(lines[i])) result.total = ticks(lines[i])
    else if (/^cpu\d/.test(lines[i])) result.cores.push(Object.assign({ id: lines[i].split(" ")[0] }, ticks(lines[i])))
  }
  return result
}

function share(a, b) {
  var all = b.all - a.all
  return all > 0 ? Math.max(0, Math.min(100, (b.busy - a.busy) / all * 100)) : 0
}

// Percent busy between two parseCpu samples, in total and per core. Cores
// match by name: one taken offline drops out of the list, and the next
// must not be measured against its ticks.
function cpuLoad(before, after) {
  var was = {}
  before.cores.forEach(function(core) { was[core.id] = core })
  return {
    total: share(before.total, after.total),
    cores: after.cores.map(function(core) { return was[core.id] ? share(was[core.id], core) : 0 })
  }
}

// Bytes from /proc/meminfo. Used is what the kernel could not hand out
// right now: total less available, as free and btop count it.
function parseMeminfo(lines) {
  var kb = {}
  for (var i = 0; i < lines.length; i++) {
    var match = /^(\w+):\s+(\d+)/.exec(lines[i])
    if (match) kb[match[1]] = Number(match[2]) * 1024
  }
  var total = kb.MemTotal || 0
  var available = kb.MemAvailable !== undefined ? kb.MemAvailable : (kb.MemFree || 0)
  return {
    total: total,
    used: Math.max(0, total - available),
    available: available,
    cached: (kb.Cached || 0) + (kb.Buffers || 0),
    swapTotal: kb.SwapTotal || 0,
    swapUsed: Math.max(0, (kb.SwapTotal || 0) - (kb.SwapFree || 0))
  }
}

// The interface of the default route in /proc/net/route, the lowest
// metric first; "" without one.
function defaultInterface(lines) {
  var best = "", metric = Infinity
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 8 || f[1] !== "00000000" || f[7] !== "00000000") continue
    if (Number(f[6]) < metric) { best = f[0]; metric = Number(f[6]) }
  }
  return best
}

// Received and sent bytes per interface from /proc/net/dev. Large counters
// can run into the colon, so the line splits there first.
function parseNetDev(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var colon = lines[i].indexOf(":")
    if (colon < 0) continue
    var f = lines[i].slice(colon + 1).trim().split(/\s+/)
    if (f.length < 9) continue
    result[lines[i].slice(0, colon).trim()] = { rx: Number(f[0]), tx: Number(f[8]) }
  }
  return result
}

// Whole disks, not partitions, device mapper or zram.
var DISK = /^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/

// Bytes read and written per disk from /proc/diskstats, which counts
// 512-byte sectors whatever the disk's own sector size.
function parseDiskstats(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 10 || !DISK.test(f[2])) continue
    result[f[2]] = { read: Number(f[5]) * 512, written: Number(f[9]) * 512 }
  }
  return result
}

// The share of the last 10 s some task stalled on each resource, from
// /proc/pressure, in percent.
function parsePressure(lines) {
  var result = { cpu: null, memory: null, io: null }
  for (var i = 0; i < lines.length; i++) {
    var match = /^(cpu|memory|io) some avg10=([\d.]+)/.exec(lines[i])
    if (match) result[match[1]] = Number(match[2])
  }
  return result
}

var CPU_CHIPS = ["k10temp", "zenpower", "coretemp", "k8temp", "cpu_thermal", "acpitz"]
var CPU_LABELS = ["Tctl", "Tdie", "Package id 0"]
// Temperature sensors on memory modules: DDR5 and DDR4.
var MEMORY_CHIPS = ["spd5118", "jc42"]

// The temperatures panel's name for a CPU sensor: the CPU itself, or one
// of its dies; null for per-core sensors, too many to list.
function cpuSensorName(label) {
  if (!label || CPU_LABELS.indexOf(label) !== -1) return "CPU"
  var die = /^Tccd(\d+)$/.exec(label)
  if (die) return "CCD " + die[1]
  return /^Core /.test(label) ? null : label
}

// From stats.sh's hwmon lines (chip, sensor, label, value) and nvme lines
// (controller, value): the CPU temperature, every fan, the temperature of
// each NVMe controller, and `temps`, the CPU's and memory modules' sensors
// by name. Temperatures in °C.
function parseSensors(hwmon, nvme) {
  var result = { cpuTemp: null, fans: [], nvme: {}, temps: [] }
  var dimms = [], named = {}
  var fallback = null, rank = Infinity
  for (var i = 0; i < hwmon.length; i++) {
    var f = hwmon[i].split("\t")
    if (f.length < 4 || f[3] === "") continue
    var value = Number(f[3])
    if (/^fan/.test(f[1])) {
      result.fans.push({ name: f[2] || f[0] + " " + f[1], rpm: value })
    } else if (/^temp/.test(f[1]) && MEMORY_CHIPS.indexOf(f[0]) !== -1) {
      dimms.push({ name: "DIMM " + (dimms.length + 1), temp: value / 1000 })
    } else if (/^temp/.test(f[1]) && CPU_CHIPS.indexOf(f[0]) !== -1) {
      var sensorName = cpuSensorName(f[2])
      if (sensorName && !named[sensorName]) { named[sensorName] = true; result.temps.push({ name: sensorName, temp: value / 1000 }) }
      var labelRank = CPU_LABELS.indexOf(f[2])
      if (labelRank !== -1 && labelRank < rank) { rank = labelRank; result.cpuTemp = value / 1000 }
      if (fallback === null) fallback = value / 1000
    }
  }
  if (result.cpuTemp === null) result.cpuTemp = fallback
  result.temps = result.temps.concat(dimms)
  for (var j = 0; j < nvme.length; j++) {
    var g = nvme[j].split("\t")
    if (g.length === 2 && g[1] !== "") result.nvme[g[0]] = Number(g[1]) / 1000
  }
  return result
}

// stats.sh's @sysinfo lines (key, value): what fastfetch shows that seldom
// changes, read every minute.
function parseSysinfo(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f.length >= 2 && f[1] !== "") result[f[0]] = f[1]
  }
  return result
}

// Firmware's stand-ins for a name it was not given.
var PLACEHOLDER = /^(|system product name|to be filled by o\.?e\.?m\.?|default string|not applicable|none|0123456789)$/i

// The machine's name: the product's, or a desktop board's when the product
// has a stand-in.
function hostName(info) {
  var product = String(info.product_name || "").trim()
  if (!PLACEHOLDER.test(product)) return product
  return String(info.board_name || "").trim()
}

// A CPU's model without the maker's marks and filler: "AMD Ryzen 9 9900X
// 12-Core Processor" is "Ryzen 9 9900X".
function shortCpu(model) {
  return String(model || "")
    .replace(/\((R|TM|tm)\)/g, "")
    .replace(/^(AMD|Intel)\s+/, "")
    .replace(/\s+\d+-Core Processor.*$/, "")
    .replace(/\s+(CPU\s+)?@.*$/, "")
    .replace(/\s+(Processor|CPU)$/, "")
    .replace(/\s+w(ith|\/)\s+Radeon.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

// stats.sh's @system lines (key, value): host name, kernel and seconds
// since boot.
function parseSystem(lines) {
  var result = { hostname: "", kernel: "", uptime: null }
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f[0] === "uptime") result.uptime = Number(String(f[1]).split(" ")[0])
    else if (f[0] in result) result[f[0]] = f[1] || ""
  }
  return result
}

// Batteries from stats.sh's @power lines (supply, key, value), in watts and
// watt-hours. Some batteries report charge and current instead of energy
// and power; times the voltage, they are the same. `device` marks a
// peripheral's battery, such as a wireless mouse's.
function parsePower(lines) {
  var supplies = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f.length < 3) continue
    ;(supplies[f[0]] || (supplies[f[0]] = {}))[f[1]] = f[2]
  }
  function number(value, scale) { return value === undefined || value === "" ? null : Number(value) / scale }
  var result = []
  for (var id in supplies) {
    var s = supplies[id]
    if (s.type !== "Battery") continue
    var volts = number(s.voltage_now, 1e6)
    var power = number(s.power_now, 1e6)
    if (power === null && volts !== null && s.current_now !== undefined) power = Number(s.current_now) / 1e6 * volts
    var energy = number(s.energy_now, 1e6)
    if (energy === null && volts !== null && s.charge_now !== undefined) energy = Number(s.charge_now) / 1e6 * volts
    var full = number(s.energy_full, 1e6)
    if (full === null && volts !== null && s.charge_full !== undefined) full = Number(s.charge_full) / 1e6 * volts
    result.push({
      id: id, name: s.model_name || id, device: s.scope === "Device", status: s.status || "",
      capacity: number(s.capacity, 1), level: s.capacity_level || "", power: power, energy: energy, full: full
    })
  }
  return result
}

// Peripherals' batteries from UPower's devices ({ nativePath, model, type,
// powerSupply, percentage 0 to 1, state }, with type and state by name),
// in parsePower's shape. UPower knows batteries the kernel does not list,
// such as Bluetooth headsets'. Power supplies (a laptop's battery) and
// devices without a name are left out.
// `devices` can be array-like, as Quickshell's lists are; the result is an
// array.
function upowerBatteries(devices) {
  var result = []
  var count = devices ? devices.length || 0 : 0
  for (var i = 0; i < count; i++) {
    var d = devices[i]
    if (!d || d.powerSupply || !d.nativePath || d.type === "Unknown" || d.type === "LinePower") continue
    result.push({
      id: String(d.nativePath), name: String(d.model || d.type), device: true, status: d.state === "Unknown" ? "" : String(d.state || ""),
      capacity: Math.round(Number(d.percentage || 0) * 100), level: "", power: null, energy: null, full: null
    })
  }
  return result
}

// The battery that leads the battery panel: the laptop's, or else the
// first peripheral's that reports a charge; null without either.
function leadBattery(power) {
  return power.filter(function(b) { return !b.device })[0]
    || power.filter(function(b) { return b.capacity !== null })[0] || null
}

// The MPRIS player the media panel follows, from Quickshell's players: one
// playing a track it names, else any naming its track, else one playing,
// else the first; null without players.
function pickPlayer(players) {
  function first(test) { for (var i = 0; i < players.length; i++) if (test(players[i])) return players[i]; return null }
  return first(function(p) { return p.isPlaying && p.trackTitle })
    || first(function(p) { return p.trackTitle })
    || first(function(p) { return p.isPlaying })
    || players[0] || null
}

// The mean of cpufreq's scaling_cur_freq values (kHz), in MHz.
function averageFrequency(lines) {
  var values = lines.map(Number).filter(function(n) { return n > 0 })
  if (!values.length) return null
  return values.reduce(function(a, b) { return a + b }, 0) / values.length / 1000
}

// nvidia-smi's "[N/A]" and "[Not Supported]" are null.
function reading(text) {
  var value = Number(text)
  return text === "" || /^\[/.test(text) || !isFinite(value) ? null : value
}

// The marketing prefixes nobody reads on a small card.
function gpuName(name) {
  return String(name).replace(/^NVIDIA\s+/, "").replace(/^GeForce\s+/, "").trim()
}

// One line of nvidia-smi --query-gpu=index,name,utilization.gpu,
// memory.used,memory.total,temperature.gpu,power.draw,power.limit,
// clocks.gr,fan.speed,utilization.encoder,utilization.decoder
// --format=csv,noheader,nounits; null for anything else.
function parseGpu(line) {
  var f = String(line).split(",").map(function(part) { return part.trim() })
  if (f.length !== 12 || !/^\d+$/.test(f[0])) return null
  var memUsed = reading(f[3]), memTotal = reading(f[4])
  return {
    index: Number(f[0]),
    name: gpuName(f[1]),
    load: reading(f[2]),
    memUsed: memUsed === null ? null : memUsed * MIB,
    memTotal: memTotal === null ? null : memTotal * MIB,
    temp: reading(f[5]),
    power: reading(f[6]),
    powerLimit: reading(f[7]),
    clock: reading(f[8]),
    fan: reading(f[9]),
    encoder: reading(f[10]),
    decoder: reading(f[11])
  }
}

// A process's short name: its file name without a Windows .exe, as Proton
// games report a full Windows path.
function shortName(path) {
  var parts = String(path).trim().split(/[\\\/]/)
  return parts[parts.length - 1].replace(/\.exe$/i, "")
}

// Apps on the GPU from nvidia-smi --query-compute-apps=pid,process_name,
// used_memory --format=csv,noheader,nounits, by video memory.
function parseGpuApps(lines) {
  var apps = []
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split(",")
    if (f.length < 3 || !/^\s*\d+\s*$/.test(f[0])) continue
    var memory = reading(f[f.length - 1].trim())
    apps.push({ pid: Number(f[0]), name: shortName(f.slice(1, -1).join(",")), memory: memory === null ? 0 : memory * MIB })
  }
  return apps.sort(function(a, b) { return b.memory - a.memory })
}

// Name and CPU ticks (user plus system) per pid from /proc/<pid>/stat
// lines. The name sits in parentheses and can hold anything, parentheses
// included, so it runs to the last one.
function parseProcs(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var open = line.indexOf(" ("), close = line.lastIndexOf(")")
    if (open < 0 || close < open) continue
    var f = line.slice(close + 2).split(" ")
    if (f.length < 13) continue
    result[line.slice(0, open)] = { name: line.slice(open + 2, close), ticks: Number(f[11]) + Number(f[12]) }
  }
  return result
}

// The busiest programs between two parseProcs samples `seconds` apart, as
// top counts it: 100% is one core. Processes of the same name add up, as
// a browser's dozens of them are one program at a glance; `pid` is the
// busiest one's and `count` how many there are. A pid that changed name
// was reused, and one that is new has no baseline; both are left out.
function topProcesses(before, after, seconds, count) {
  var byName = {}
  if (!(seconds > 0)) return []
  for (var pid in after) {
    var was = before[pid]
    if (!was || was.name !== after[pid].name) continue
    var cpu = (after[pid].ticks - was.ticks) / HZ / seconds * 100
    if (!(cpu > 0)) continue
    var name = after[pid].name
    var entry = byName[name] || (byName[name] = { pid: Number(pid), name: name, cpu: 0, count: 0, most: 0 })
    entry.cpu += cpu
    entry.count++
    if (cpu > entry.most) { entry.most = cpu; entry.pid = Number(pid) }
  }
  return Object.keys(byName).map(function(name) {
    var entry = byName[name]
    return { pid: entry.pid, name: entry.name, cpu: entry.cpu, count: entry.count }
  }).sort(function(a, b) { return b.cpu - a.cpu }).slice(0, count)
}

// --- state -----------------------------------------------------------------

// The paced animations' curve: slow at both ends, like Easing.InOutQuad,
// for `t` from 0 to 1.
function ease(t) {
  t = Math.max(0, Math.min(1, t))
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
}

// How far, from 0 to 1, an animation that began at `start` and lasts
// `duration` has come at `now`, all in milliseconds.
function progress(now, start, duration) {
  if (!(duration > 0)) return 1
  return Math.max(0, Math.min(1, (now - start) / duration))
}

function pushHistory(series, value, length) {
  var next = series.concat([value])
  var keep = length || HISTORY
  return next.length > keep ? next.slice(next.length - keep) : next
}

function empty() {
  return {
    time: null,
    counters: null,
    cpu: { total: null, cores: [], threads: 0, temp: null, frequency: null, loadavg: [] },
    memory: null,
    network: { interface: "", rx: null, tx: null, rxTotal: 0, txTotal: 0 },
    disks: [],
    pressure: null,
    fans: [],
    processes: [],
    processSample: null,
    // The NVIDIA GPU from nvidia-smi, and AMD and Intel GPUs from sysfs
    // (drmGpus); gpuRoles picks which panel shows which. `gpuKey` is the
    // main GPU whose history `history.gpu` holds.
    nvidia: null,
    nvidiaMissing: false,
    nvidiaAge: 0,
    // What sysfs tells of the NVIDIA cards without waking them: whether
    // one can power itself down (`managed`, runtime power management on,
    // as on a laptop) and whether one is asleep; the frames in a row its
    // readings showed it idle; and its name, for while it sleeps.
    nvidiaPower: { managed: false, asleep: false },
    nvidiaIdle: 0,
    nvidiaName: "",
    // Each AMD or Intel card's kind as last seen awake: asleep, a card
    // reports no VRAM to tell.
    drmKinds: {},
    igpuKey: "",
    drm: [],
    gpuKey: "",
    gpuApps: [],
    temps: [],
    nvmeTemps: {},
    // stats.sh's @slowhwmon lines, which come every few frames only.
    slowHwmon: [],
    system: null,
    // stats.sh's @sysinfo (parseSysinfo), which comes every minute only.
    sysinfo: null,
    threads: null,
    power: [],
    // The track playing, from the shell's MPRIS players; see step.
    media: null,
    history: { cpu: [], gpu: [], igpu: [], fan: [], memory: [], rx: [], tx: [], disk: [], pressure: [], temp: [], battery: [] }
  }
}

function rate(before, after, seconds) {
  if (before === undefined || before === null || !(seconds > 0)) return null
  var value = (after - before) / seconds
  // A counter that went backwards was reset.
  return value >= 0 ? value : null
}

// The busiest interface when there is no default route.
function busiestInterface(net) {
  var best = "", most = -1
  for (var name in net) {
    if (name === "lo") continue
    if (net[name].rx + net[name].tx > most) { best = name; most = net[name].rx + net[name].tx }
  }
  return best
}

// `state` updated with one parsed stats.sh frame. Rates need the frame
// before, so the first frame (and the first after a gap) has none.
function ingest(state, frame) {
  state = state || empty()
  var next = Object.assign({}, state)
  var history = Object.assign({}, state.history)
  var seconds = state.time === null ? 0 : frame.time - state.time
  var fresh = state.counters !== null && seconds > 0 && seconds <= GAP
  var before = fresh ? state.counters : null
  var cards = parseDrm(frame.drm || [])
  // NVIDIA's cards only say whether they sleep; nvidia-smi reads them.
  var nvidiaPower = { managed: false, asleep: false }
  for (var id in cards) {
    if (cards[id].driver !== "nvidia") continue
    if (cards[id].control === "auto") nvidiaPower.managed = true
    if (cards[id].status === "suspended") nvidiaPower.asleep = true
    delete cards[id]
  }
  next.nvidiaPower = nvidiaPower
  var counters = {
    cpu: parseCpu(frame.stat || []),
    net: parseNetDev(frame.net || []),
    disk: parseDiskstats(frame.disk || []),
    drmIdle: {}
  }
  for (var card in cards) if (cards[card].idle_ms !== undefined) counters.drmIdle[card] = cards[card].idle_ms
  // Sensors stats.sh reads every few frames only (a Dell's fans, through
  // firmware) keep their last lines between reads.
  var slow = frame.slowhwmon || state.slowHwmon || []
  next.slowHwmon = slow
  var sensors = parseSensors((frame.hwmon || []).concat(slow), frame.nvme || [])
  // stats.sh reads NVMe temperatures every few frames only; between them
  // the last ones stand.
  if (!frame.nvme) sensors.nvme = state.nvmeTemps || {}

  var load = before ? cpuLoad(before.cpu, counters.cpu) : null
  next.cpu = {
    total: load ? load.total : null,
    cores: load ? load.cores : [],
    threads: counters.cpu.cores.length,
    temp: sensors.cpuTemp,
    frequency: averageFrequency(frame.freq || []),
    loadavg: (frame.loadavg && frame.loadavg[0] ? frame.loadavg[0].split(" ").slice(0, 3).map(Number) : [])
  }
  if (load) history.cpu = pushHistory(history.cpu, load.total)

  next.memory = parseMeminfo(frame.meminfo || [])
  if (next.memory.total > 0) history.memory = pushHistory(history.memory, next.memory.used / next.memory.total * 100)

  var name = defaultInterface(frame.route || []) || busiestInterface(counters.net)
  var now = counters.net[name]
  var was = before && before.net[name]
  next.network = {
    interface: now ? name : "",
    rx: now && was ? rate(was.rx, now.rx, seconds) : null,
    tx: now && was ? rate(was.tx, now.tx, seconds) : null,
    rxTotal: now ? now.rx : 0,
    txTotal: now ? now.tx : 0
  }
  if (next.network.rx !== null) history.rx = pushHistory(history.rx, next.network.rx)
  if (next.network.tx !== null) history.tx = pushHistory(history.tx, next.network.tx)

  var models = {}
  ;(frame.model || []).forEach(function(line) {
    var f = line.split("\t")
    models[f[0]] = (f[1] || "").trim()
  })
  var total = null
  next.disks = Object.keys(counters.disk).sort().map(function(disk) {
    var then = before && before.disk[disk]
    var controller = /^(nvme\d+)n/.exec(disk)
    var entry = {
      name: disk,
      model: models[disk] || "",
      read: then ? rate(then.read, counters.disk[disk].read, seconds) : null,
      write: then ? rate(then.written, counters.disk[disk].written, seconds) : null,
      temp: controller && sensors.nvme[controller[1]] !== undefined ? sensors.nvme[controller[1]] : null
    }
    if (entry.read !== null || entry.write !== null) total = (total || 0) + (entry.read || 0) + (entry.write || 0)
    return entry
  })
  if (total !== null) history.disk = pushHistory(history.disk, total)

  next.pressure = parsePressure(frame.psi || [])
  var p = next.pressure
  if (p.cpu !== null || p.memory !== null || p.io !== null)
    history.pressure = pushHistory(history.pressure, Math.max(p.cpu || 0, p.memory || 0, p.io || 0))

  next.fans = sensors.fans
  next.temps = sensors.temps
  next.nvmeTemps = sensors.nvme
  if (sensors.cpuTemp !== null) history.temp = pushHistory(history.temp, sensors.cpuTemp)
  next.system = frame.system ? parseSystem(frame.system) : null
  next.sysinfo = frame.sysinfo ? parseSysinfo(frame.sysinfo) : state.sysinfo
  var tasks = next.cpu.loadavg.length && frame.loadavg[0].split(" ")[3]
  next.threads = tasks ? Number(tasks.split("/")[1]) : null
  next.power = parsePower(frame.power || [])
  next.drmKinds = Object.assign({}, state.drmKinds)
  next.drm = drmGpus(cards, before ? before.drmIdle : {}, seconds, next.drmKinds, state.drm)

  if (frame.procs) {
    var procs = parseProcs(frame.procs)
    var last = state.processSample
    var elapsed = last ? frame.time - last.time : 0
    if (last && elapsed > 0 && elapsed <= PROCESS_GAP) next.processes = topProcesses(last.procs, procs, elapsed, 10)
    next.processSample = { time: frame.time, procs: procs }
  }
  if (frame.gpuapps) next.gpuApps = parseGpuApps(frame.gpuapps)

  next.time = frame.time
  next.counters = counters
  next.history = history
  return next
}

// `state` updated with nvidia-smi's lines since the last frame (one, or a
// list: it prints a line per GPU). With several NVIDIA GPUs the one with
// the lowest index is shown. Without a line, `state` as it was.
function ingestGpu(state, lines) {
  var gpu = null
  ;[].concat(lines || []).forEach(function(line) {
    var parsed = parseGpu(line)
    if (parsed && (!gpu || parsed.index < gpu.index)) gpu = parsed
  })
  if (!gpu) return state
  var next = Object.assign({}, state)
  next.nvidia = gpu
  next.nvidiaMissing = false
  next.nvidiaAge = 0
  return next
}

// Frames without an nvidia-smi line after which its reading is dropped:
// nvidia-smi stopped, rather than a line arriving late.
var NVIDIA_STALE = 5

// The AMD and Intel lines of stats.sh's @drm section (card, driver, key,
// value) by card: { card2: { driver: "amdgpu", busy: 99, ... } }.
function parseDrm(lines) {
  var cards = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f.length < 4 || f[3] === "") continue
    var card = cards[f[0]] || (cards[f[0]] = { driver: f[1] })
    card[f[2]] = f[2] === "status" || f[2] === "control" ? f[3] : Number(f[3])
  }
  return cards
}

// Intel cards with this much VRAM or more are discrete. AMD's tell: a
// discrete card's memory has a vendor (`dedicated`), while an integrated
// one's is a share of system memory, however large.
var DISCRETE_VRAM = 4 * 1073741824

// GPUs, in the shape parseGpu gives NVIDIA's, from parseDrm's cards.
// `idleBefore` holds each Intel card's idle milliseconds from the frame
// `seconds` before: Intel has no load reading, so load is the share of
// that time the GPU was not idle. A card the kernel has put to sleep is
// left asleep, with no readings: reading it would wake it.
// `kinds` holds each card's kind as last seen awake, and is kept current:
// a sleeping card reports no VRAM, and keeps the kind it had.
// A resting card (stats.sh leaves an idle one alone so it can sleep) keeps
// its readings from `previous`, the GPUs before.
function drmGpus(cards, idleBefore, seconds, kinds, previous) {
  kinds = kinds || {}
  return Object.keys(cards).sort().map(function(id) {
    var c = cards[id]
    var amd = c.driver === "amdgpu"
    var memTotal = c.vram_total !== undefined ? c.vram_total : null
    if (amd ? c.status !== "suspended" && !c.rest : memTotal !== null)
      kinds[id] = (amd ? c.dedicated === 1 : memTotal >= DISCRETE_VRAM) ? "discrete" : "integrated"
    if (c.rest && c.status !== "suspended") {
      var last = (previous || []).filter(function(gpu) { return gpu.id === id })[0]
      if (last) return Object.assign({}, last, { asleep: false, resting: true })
    }
    var discrete = kinds[id] === "discrete"
    var gpu = {
      id: id,
      vendor: amd ? "AMD" : "Intel",
      name: amd ? (discrete ? "Radeon" : "Radeon Graphics") : (discrete ? "Intel Arc" : "Intel Graphics"),
      kind: discrete ? "discrete" : "integrated",
      asleep: c.status === "suspended",
      resting: false,
      load: null, memUsed: null, memTotal: null, temp: null, power: null, powerLimit: null,
      clock: null, fan: null, encoder: null, decoder: null
    }
    if (gpu.asleep) return gpu
    if (c.busy !== undefined) gpu.load = c.busy
    else if (c.idle_ms !== undefined && idleBefore[id] !== undefined && seconds > 0)
      gpu.load = Math.max(0, Math.min(100, 100 * (1 - (c.idle_ms - idleBefore[id]) / (seconds * 1000))))
    gpu.memTotal = memTotal
    if (c.vram_used !== undefined) gpu.memUsed = c.vram_used
    if (c.temp !== undefined) gpu.temp = c.temp / 1000
    if (c.power !== undefined) gpu.power = c.power / 1e6
    if (c.power_cap !== undefined) gpu.powerLimit = c.power_cap / 1e6
    if (c.freq !== undefined) gpu.clock = c.freq / 1e6
    else if (c.freq_mhz !== undefined) gpu.clock = c.freq_mhz
    if (c.pwm !== undefined) gpu.fan = Math.round(c.pwm / 255 * 100)
    return gpu
  })
}

// The NVIDIA GPU while it sleeps: its name, if it was seen awake, and no
// readings.
function asleepNvidia(state) {
  return {
    id: "nvidia" + (state.nvidia ? state.nvidia.index : 0), vendor: "NVIDIA", kind: "discrete", asleep: true, resting: false,
    name: state.nvidiaName || "NVIDIA GPU",
    load: null, memUsed: null, memTotal: null, temp: null, power: null, powerLimit: null,
    clock: null, fan: null, encoder: null, decoder: null
  }
}

// Frames in a row a dGPU that can power itself down must show no load
// before it is left to rest: nvidia-smi stops, and stats.sh reads an AMD
// card only now and then. Reading a GPU keeps it awake.
var REST_AFTER = 5

// How the sampler should read the NVIDIA GPU: "on", nvidia-smi's loop;
// "check", a single reading now and then, while it rests; "off", not at
// all, while it sleeps. Only a dGPU that can power itself down rests.
function nvidiaPoll(state) {
  var power = state.nvidiaPower || {}
  if (!power.managed) return "on"
  if (power.asleep) return "off"
  return state.nvidiaIdle >= REST_AFTER ? "check" : "on"
}

// Which GPU each panel shows: `main`, for the GPU panel, is the first
// discrete one (NVIDIA first), or else the only kind there is; `integrated`,
// for the iGPU panel, an integrated GPU beside it, or null.
function gpuRoles(state) {
  var all = []
  var power = state.nvidiaPower || {}
  if (power.asleep) all.push(asleepNvidia(state))
  else if (state.nvidia) all.push(Object.assign({ id: "nvidia" + state.nvidia.index, vendor: "NVIDIA", kind: "discrete", asleep: false }, state.nvidia))
  all = all.concat(state.drm || [])
  var main = null, integrated = null
  for (var i = 0; i < all.length; i++) if (all[i].kind === "discrete") { main = all[i]; break }
  if (!main) main = all[0] || null
  for (var j = 0; j < all.length; j++) if (all[j].kind === "integrated" && all[j] !== main) { integrated = all[j]; break }
  return { main: main, integrated: integrated }
}

// One update of the dashboard: a stats.sh frame (its text) with the
// latest nvidia-smi line since the frame before, or "" when none came, and
// `media`, the track playing ({ identity, title, artist, album, art,
// playing, position, length } or null), when the media panel is shown,
// and `batteries`, UPower's (upowerBatteries), when the battery panel is.
// Everything on screen changes at once, a sample a second, and the GPU's
// history advances with the frames like the others: a frame without a new
// line repeats the last reading.
function step(state, text, gpuLine, media, batteries) {
  var next = ingest(state, parseFrame(text))
  // UPower's peripherals, when the battery panel is shown, after the
  // kernel's (which come first for the same device).
  if (batteries) {
    var known = next.power.map(function(b) { return b.id })
    var power = next.power.slice()
    for (var b = 0; b < batteries.length; b++) if (known.indexOf(batteries[b].id) === -1) power.push(batteries[b])
    next.power = power
  }
  // The battery panel's headline: the laptop's, or else a peripheral's.
  var lead = leadBattery(next.power)
  if (lead && lead.capacity !== null) next.history.battery = pushHistory(next.history.battery, lead.capacity)
  var updated = ingestGpu(next, gpuLine)
  if (updated !== next) {
    next = updated
    var reading = next.nvidia
    next.nvidiaName = reading.name
    next.nvidiaIdle = reading.load === 0 && !reading.encoder && !reading.decoder ? state.nvidiaIdle + 1 : 0
    next.nvidia = Object.assign({}, reading, { resting: false })
  } else if (next.nvidiaPower.asleep) {
    next.nvidiaIdle = 0
  } else if (next.nvidia && nvidiaPoll(next) !== "on") {
    // Read only now and then, it keeps its last reading.
    if (!next.nvidia.resting) next.nvidia = Object.assign({}, next.nvidia, { resting: true })
    next.nvidiaAge = 0
  } else if (next.nvidia && ++next.nvidiaAge > NVIDIA_STALE) { next.nvidia = null; next.nvidiaAge = 0 }
  if (media !== undefined) next.media = media
  var roles = gpuRoles(next)
  var history = next.history
  var key = roles.main ? roles.main.id : ""
  // Another GPU taking over the panel starts its own history.
  if (key !== next.gpuKey) { history.gpu = []; history.fan = []; next.gpuKey = key }
  if (roles.main && roles.main.load !== null) history.gpu = pushHistory(history.gpu, roles.main.load)
  if (roles.main && roles.main.fan !== null) history.fan = pushHistory(history.fan, roles.main.fan)
  var igpuKey = roles.integrated ? roles.integrated.id : ""
  if (igpuKey !== next.igpuKey) { history.igpu = []; next.igpuKey = igpuKey }
  if (roles.integrated && roles.integrated.load !== null) history.igpu = pushHistory(history.igpu, roles.integrated.load)
  return next
}

// --- theme -------------------------------------------------------------------

// The #rrggbb colors of an Omarchy colors.toml by name, lowercase.
function parseColors(text) {
  var colors = {}
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var match = /^\s*([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})\b/.exec(lines[i])
    if (match) colors[match[1]] = match[2].toLowerCase()
  }
  return colors
}

// The dashboard's colors from the theme's colors.toml, built the way
// Omarchy's btop themes are: each box has its own hue and graphs run
// through three. Names missing from the theme fall back to the numbered
// terminal colors, then to `fallback` (the shell's own foreground, accent
// and so on).
function palette(colors, fallback) {
  colors = colors || {}
  fallback = fallback || {}
  var foreground = colors.foreground || colors.color7 || fallback.foreground || "#cccccc"
  var background = colors.background || colors.color0 || fallback.background || "#000000"
  var accent = colors.accent || colors.color4 || fallback.accent || foreground
  var muted = colors.muted || colors.color8 || fallback.muted || mix(foreground, background, 0.5)
  function named(name, number, extra) { return colors[name] || colors[number] || extra || accent }
  var red = named("red", "color1", fallback.urgent)
  var green = named("green", "color2")
  var yellow = named("yellow", "color3")
  var blue = named("blue", "color4")
  var magenta = named("magenta", "color5")
  var cyan = named("cyan", "color6")
  var orange = colors.orange || yellow
  return {
    foreground: foreground,
    background: background,
    accent: accent,
    line: muted,
    subtle: mix(foreground, background, 0.35),
    // The dashboard sits on black, so its tracks are mixed from black too.
    meter: mix("#000000", foreground, 0.13),
    boxes: { gpu: cyan, igpu: mix(cyan, green, 0.5), temps: mix(yellow, red, 0.5), battery: green, media: mix(magenta, blue, 0.5), system: accent, cpu: magenta, memory: green, network: red, disks: yellow, processes: blue, pressure: orange, fans: accent },
    gradients: {
      cpu: [cyan, blue, magenta],
      temp: [green, yellow, red],
      used: [green, cyan, blue],
      download: [yellow, orange, red],
      upload: [green, cyan, blue],
      process: [cyan, blue, magenta]
    }
  }
}

function channels(hex) {
  var n = parseInt(String(hex).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// `a` moved towards `b` by `t` (0 to 1).
function mix(a, b, t) {
  var x = channels(a), y = channels(b)
  return "#" + x.map(function(c, i) {
    return ("0" + Math.round(c + (y[i] - c) * t).toString(16)).slice(-2)
  }).join("")
}

// The color at `fraction` (0 to 1) along evenly spaced `stops`.
function gradientAt(stops, fraction) {
  var t = Math.max(0, Math.min(1, Number(fraction) || 0)) * (stops.length - 1)
  var i = Math.min(Math.floor(t), stops.length - 2)
  return mix(stops[i], stops[i + 1], t - i)
}

// --- text --------------------------------------------------------------------

var UNITS = ["B", "KiB", "MiB", "GiB", "TiB"]

function scaled(bytes) {
  var value = Math.max(0, Number(bytes) || 0), unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit++ }
  return { value: value, unit: unit }
}

function number(value, unit) {
  return unit === 0 ? String(Math.round(value)) : value < 100 ? value.toFixed(1) : String(Math.round(value))
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—"
  var s = scaled(bytes)
  return number(s.value, s.unit) + " " + UNITS[s.unit]
}

// "7.4 / 16.0 GiB": both in the unit of the total.
function formatPair(used, total) {
  var s = scaled(total)
  var factor = Math.pow(1024, s.unit)
  return number(used / factor, s.unit) + " / " + number(s.value, s.unit) + " " + UNITS[s.unit]
}

function formatRate(bytes) {
  return bytes === null || bytes === undefined ? "—" : formatBytes(bytes) + "/s"
}

// A byte count in a few characters, for rows with several of them: "936K".
function formatShort(bytes) {
  if (bytes === null || bytes === undefined) return "—"
  var s = scaled(bytes)
  return number(s.value, s.unit) + (s.unit ? UNITS[s.unit].charAt(0) : "")
}

// A track position: "1:23", or "1:02:03" past an hour.
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return "—"
  seconds = Math.max(0, Math.floor(seconds))
  var h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60
  return (h ? h + ":" + ("0" + m).slice(-2) : String(m)) + ":" + ("0" + s).slice(-2)
}

// A long stretch in its two largest units: "2d 7h", "9h 50m", "5m".
function formatUptime(seconds) {
  var minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24)
  if (days) return days + "d " + hours % 24 + "h"
  if (hours) return hours + "h " + minutes % 60 + "m"
  return minutes + "m"
}

function formatPercent(value) {
  return value === null || value === undefined ? "—" : Math.round(value) + "%"
}

function formatTemp(value) {
  return value === null || value === undefined ? "—" : Math.round(value) + "°C"
}

function formatFrequency(mhz) {
  if (mhz === null || mhz === undefined) return "—"
  return mhz >= 1000 ? (mhz / 1000).toFixed(2) + " GHz" : Math.round(mhz) + " MHz"
}

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
  v.value = formatPercent(gpu.load)
  v.valueColor = gradientAt(g.cpu, (gpu.load || 0) / 100)
  v.caption = gpu.resting ? "idle" : "load"
  v.graphs.push({ values: history, max: 100, stops: g.cpu, label: "" })
    if (gpu.memUsed !== null && gpu.memTotal) v.rows.push(row("VRAM", formatPair(gpu.memUsed, gpu.memTotal), gpu.memUsed / gpu.memTotal, gradientAt(g.used, gpu.memUsed / gpu.memTotal)))
  if (gpu.temp !== null) v.rows.push(row("Temp", formatTemp(gpu.temp), gpu.temp / 100, gradientAt(g.temp, gpu.temp / 100)))
  if (gpu.power !== null) {
    var limit = gpu.powerLimit
    v.rows.push(row("Power", limit ? watts(gpu.power) + " / " + watts(limit) + " W" : watts(gpu.power) + " W",
      limit ? gpu.power / limit : null, limit ? gradientAt(g.temp, gpu.power / limit) : ""))
  }
  if (gpu.clock !== null) v.rows.push(row("Clock", formatFrequency(gpu.clock), null))
  if (gpu.fan !== null) v.rows.push(row("Fan", formatPercent(gpu.fan), gpu.fan / 100, gradientAt(g.cpu, gpu.fan / 100)))
  if (gpu.encoder) v.rows.push(row("Encode", formatPercent(gpu.encoder), gpu.encoder / 100, gradientAt(g.cpu, gpu.encoder / 100)))
  if (gpu.decoder) v.rows.push(row("Decode", formatPercent(gpu.decoder), gpu.decoder / 100, gradientAt(g.cpu, gpu.decoder / 100)))
}

// Units of width under which a disk's row leaves out its temperature.
var DISK_TEMP_SPAN = 26

// Watts, with a decimal below 10: an iGPU draws fractions of one.
function watts(value) {
  return value < 10 ? value.toFixed(1) : String(Math.round(value))
}

var VIEWS = {
  gpu: function(v, state, palette, g, room, wide) {
    var gpu = gpuRoles(state).main
    if (!gpu) { v.empty = state.time !== null && state.nvidiaMissing ? "No GPU found" : "Waiting for data"; return }
    gpuView(v, gpu, state.history.gpu, g, room, wide)
  },

  igpu: function(v, state, palette, g, room, wide) {
    var roles = gpuRoles(state)
    if (roles.integrated) gpuView(v, roles.integrated, state.history.igpu, g, room, wide)
    else v.empty = roles.main && roles.main.kind === "integrated" ? "Shown as GPU" : "No integrated GPU"
  },
  cpu: function(v, state, palette, g) {
    var cpu = state.cpu
    v.info = cpu.threads ? cpu.threads + " threads" : ""
    v.value = formatPercent(cpu.total)
    v.valueColor = gradientAt(g.cpu, (cpu.total || 0) / 100)
    v.caption = "load"
    v.graphs.push({ values: state.history.cpu, max: 100, stops: g.cpu, label: "" })
    v.bars = cpu.cores.map(function(load) { return { fraction: load / 100, color: gradientAt(g.cpu, load / 100) } })
    if (cpu.temp !== null) v.rows.push(row("Temp", formatTemp(cpu.temp), cpu.temp / 100, gradientAt(g.temp, cpu.temp / 100)))
    if (cpu.frequency !== null) v.rows.push(row("Clock", formatFrequency(cpu.frequency), null))
    if (cpu.loadavg.length) v.rows.push(row("Load", cpu.loadavg.map(function(n) { return n.toFixed(2) }).join("  "), null))
  },

  memory: function(v, state, palette, g) {
    var m = state.memory
    if (!m || !m.total) { v.empty = "Waiting for data"; return }
    var used = m.used / m.total
    v.info = formatBytes(m.total)
    v.value = formatPercent(used * 100)
    v.valueColor = gradientAt(g.used, used)
    v.caption = "used"
    v.graphs.push({ values: state.history.memory, max: 100, stops: g.used, label: "" })
    v.rows.push(row("Used", formatBytes(m.used), used, gradientAt(g.used, used)))
    v.rows.push(row("Available", formatBytes(m.available), m.available / m.total, gradientAt(g.upload, m.available / m.total)))
    v.rows.push(row("Cached", formatBytes(m.cached), m.cached / m.total, gradientAt(g.process, m.cached / m.total)))
    if (m.swapTotal) v.rows.push(row("Swap", formatPair(m.swapUsed, m.swapTotal), m.swapUsed / m.swapTotal, gradientAt(g.temp, m.swapUsed / m.swapTotal)))
  },

  network: function(v, state, palette, g) {
    var n = state.network
    if (!n.interface) { v.empty = "No network"; return }
    v.info = n.interface
    v.graphs.push({ values: state.history.rx, max: graphMax(state.history.rx, 10240), stops: g.download, label: "↓ " + formatRate(n.rx) })
    v.graphs.push({ values: state.history.tx, max: graphMax(state.history.tx, 10240), stops: g.upload, label: "↑ " + formatRate(n.tx) })
    v.rows.push(row("Received", formatBytes(n.rxTotal), null))
    v.rows.push(row("Sent", formatBytes(n.txTotal), null))
  },

  disks: function(v, state, palette, g, room, wide, span) {
    if (!state.disks.length) { v.empty = "No disks"; return }
    v.info = state.disks.length === 1 ? "1 disk" : state.disks.length + " disks"
    v.graphs.push({ values: state.history.disk, max: graphMax(state.history.disk, 1048576), stops: g.process, label: "I/O" })
    v.rows = state.disks.map(function(disk) {
      var text = "R " + formatShort(disk.read) + "  W " + formatShort(disk.write)
      // A narrow card has no room for it; the Temperatures panel has it.
      if (disk.temp !== null && !(span < DISK_TEMP_SPAN)) text += "  " + formatTemp(disk.temp)
      return row(disk.name, text, null, disk.temp !== null ? gradientAt(g.temp, disk.temp / 100) : "")
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
      return { name: p.count > 1 ? p.name + " ×" + p.count : p.name, text: formatPercent(p.cpu), fraction: Math.min(1, p.cpu / 100), color: gradientAt(g.process, Math.min(1, p.cpu / 100)) }
    }) })
    if (vram) {
      var total = state.nvidia && state.nvidia.memTotal
      v.lists.push({ title: "VRAM", items: state.gpuApps.slice(0, apps).map(function(app) {
        var share = total ? app.memory / total : null
        return { name: app.name, text: formatBytes(app.memory), fraction: share, color: gradientAt(g.used, share || 0) }
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
      v.rows.push(row(pair[0], pair[1].toFixed(1) + "%", fraction, gradientAt(g.temp, fraction)))
    })
  },

  temps: function(v, state, palette, g, room, wide) {
    function temp(name, value) { return row(name, formatTemp(value), value / 100, gradientAt(g.temp, value / 100)) }
    var roles = gpuRoles(state)
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
      v.value = formatTemp(state.cpu.temp)
      v.valueColor = gradientAt(g.temp, state.cpu.temp / 100)
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
    var lead = leadBattery(state.power)
    if (lead && !laptop) {
      v.value = formatPercent(lead.capacity)
      v.valueColor = gradientAt(g.temp, 1 - lead.capacity / 100)
      v.caption = lead.name
      v.graphs.push({ values: state.history.battery, max: 100, stops: g.used, label: "" })
    }
    if (laptop) {
      var cap = laptop.capacity
      v.value = formatPercent(cap)
      v.valueColor = gradientAt(g.temp, 1 - (cap || 0) / 100)
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
      v.rows.push(row(d.name, d.capacity !== null ? formatPercent(d.capacity) : d.level || "—",
        fraction === undefined ? null : fraction, gradientAt(g.temp, 1 - (fraction || 0))))
    })
    if (!laptop && !devices.length) v.empty = "No batteries"
  },

  media: function(v, state, palette, g) {
    var m = state.media
    if (!m) { v.empty = "Nothing playing"; return }
    // A player that names no track (a browser tab, say) is named instead.
    v.info = m.title ? m.identity || "" : ""
    v.media = {
      title: m.title || m.identity || "Unknown player",
      artist: m.artist || "",
      album: m.album || "",
      art: m.art || "",
      playing: !!m.playing,
      progress: m.length > 0 ? Math.max(0, Math.min(1, m.position / m.length)) : null,
      // Without a length, a position (a browser's 0:00) tells nothing.
      time: m.length > 0 ? formatDuration(m.position) + " / " + formatDuration(m.length) : ""
    }
  },

  system: function(v, state, palette, g) {
    var system = state.system
    if (!system) { v.empty = "Waiting for data"; return }
    var info = state.sysinfo || {}
    v.info = info.user ? info.user + "@" + system.hostname : system.hostname
    v.logo = true
    if (system.uptime !== null) { v.value = formatUptime(system.uptime); v.caption = "up" }
    v.valueColor = palette.accent
    // In fastfetch's order, the most telling first: a small card keeps those.
    function add(label, text) { if (text) v.rows.push(row(label, text, null)) }
    add("OS", [info.os, info.omarchy].filter(Boolean).join(" "))
    add("Host", hostName(info))
    add("Kernel", system.kernel)
    add("CPU", shortCpu(info.cpu))
    var roles = gpuRoles(state)
    if (roles.main) add("GPU", roles.main.name)
    if (roles.integrated) add("iGPU", roles.integrated.name)
    if (state.memory && state.memory.total) add("Memory", formatPair(state.memory.used, state.memory.total))
    var packages = []
    if (Number(info.packages) > 0) packages.push(info.packages + " pacman")
    if (Number(info.flatpaks) > 0) packages.push(info.flatpaks + " flatpak")
    add("Packages", packages.join(", "))
    add("Shell", info.shell)
    add("Desktop", info.desktop)
    add("Theme", info.theme)
    if (state.cpu.loadavg.length) v.rows.push(row("Load", state.cpu.loadavg.map(function(n) { return n.toFixed(2) }).join("  "), null))
    if (state.threads !== null) v.rows.push(row("Threads", String(state.threads), null))
  },

  fans: function(v, state, palette, g) {
    var gpu = gpuRoles(state).main
    if (gpu && gpu.fan !== null) {
      v.value = formatPercent(gpu.fan)
      v.valueColor = gradientAt(g.cpu, gpu.fan / 100)
      v.caption = "GPU fan"
      v.graphs.push({ values: state.history.fan || [], max: 100, stops: g.cpu, label: "" })
    }
    v.rows = state.fans.map(function(fan) {
      return row(fan.name, fan.rpm + " RPM", fan.rpm / 3000, gradientAt(g.cpu, fan.rpm / 3000))
    })
    if (gpu && gpu.fan !== null) v.rows.push(row("GPU", formatPercent(gpu.fan), gpu.fan / 100, gradientAt(g.cpu, gpu.fan / 100)))
    if (!v.rows.length) v.empty = "No fan sensors"
  }
}
