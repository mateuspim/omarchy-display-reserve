import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

// Stats.js is a QML `.pragma library` script, loaded like Model.js.
const source = readFileSync(new URL("../Stats.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "")
const Stats = {}
vm.runInNewContext(source, Stats)

// Objects made inside the sandbox have its prototypes; copy them out so
// strict deep equality compares only their contents.
const plain = value => JSON.parse(JSON.stringify(value))

// One frame of stats.sh as captured on a desktop with a Ryzen, an RTX 4080,
// two NVMe drives and a SATA SSD.
const frame = (time, cpu, extra = "") => `@time ${time}
@stat
cpu  ${cpu.join(" ")}
cpu0 ${cpu.map(n => Math.floor(n / 2)).join(" ")}
cpu1 ${cpu.map(n => Math.ceil(n / 2)).join(" ")}
@loadavg
0.52 0.61 0.70 2/1234 5678
@meminfo
MemTotal:       63412576 kB
MemFree:         3389572 kB
MemAvailable:   35827448 kB
Buffers:            3676 kB
Cached:         36056908 kB
SwapTotal:      126826340 kB
SwapFree:       126826340 kB
@route
Iface	Destination	Gateway 	Flags	RefCnt	Use	Metric	Mask		MTU	Window	IRTT
eno1	82624692	0132A8C0	0007	0	0	100	FFFFFFFF	0	0	0
eno1	00000000	0132A8C0	0003	0	0	100	00000000	0	0	0
@net
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 173185512 1045587    0    0    0     0          0         0 173185512 1045587    0    0    0     0       0          0
  eno1:${29099514268 + time * 1000} 21340164    0  578    0     0          0     40622 ${1410672755 + time * 100} 9140346    0    0    0     0       0          0
@disk
   8       0 sda 243 2 8385 121 4 0 0 0 0 103 121 0 0 0 0 4 0
 259       0 nvme0n1 197532 1577 ${43858112 + time * 2} 184524 45005 399 5502352 60618 0 37472 246574 803 0 3832304 451 192 980
 259       1 nvme0n1p1 197462 1577 43855576 184516 45005 399 5502352 60618 0 37259 245585 803 0 3832304 451 0 0
 252       0 zram0 75 0 2848 0 1 0 8 0 0 0 0 0 0 0 0 0 0
 254       0 dm-0 75 0 2848 0 1 0 8 0 0 0 0 0 0 0 0 0 0
@model
nvme0n1	KINGSTON SFYRDK2000G
sda	SanDisk SSD PLUS
@psi
cpu some avg10=0.12 avg60=0.30 avg300=0.34 total=136314838
cpu full avg10=0.00 avg60=0.00 avg300=0.00 total=0
memory some avg10=1.50 avg60=0.00 avg300=0.00 total=36660
io some avg10=4.00 avg60=0.00 avg300=0.00 total=14948124
@hwmon
nvme	temp1	Composite	34850
k10temp	temp1	Tctl	67375
k10temp	temp3	Tccd1	65500
asus	fan1	CPU fan	1210
amdgpu	temp1	edge	41000
@nvme
nvme0	34850
nvme1	42850
@freq
5399595
4800000
@drm
card2	amdgpu	status	active
card2	amdgpu	busy	99
card2	amdgpu	vram_used	1228115968
card2	amdgpu	vram_total	2147483648
card2	amdgpu	temp	60000
card2	amdgpu	power	157000
card2	amdgpu	freq	2200000000
${extra}@end
`

const ALL_PANELS = ["gpu", "igpu", "cpu", "memory", "network", "disks", "processes", "pressure", "fans"]

const tests = {
  "parseFrame splits a frame into its sections"() {
    const sections = Stats.parseFrame(frame(10, [1, 2, 3, 4, 5, 6, 7, 8, 0, 0]))
    assert.equal(sections.time, 10)
    assert.equal(sections.stat.length, 3)
    assert.equal(sections.freq.length, 2)
    assert.equal(sections.procs, undefined)
  },
  "parseCpu reads busy and total ticks per line"() {
    const cpu = Stats.parseCpu(["cpu  100 0 50 800 50 0 0 0 0 0", "cpu0 10 0 0 90 0 0 0 0 0 0"])
    // Idle is idle plus iowait; guest time is already counted in user.
    assert.deepEqual(plain(cpu), { total: { busy: 150, all: 1000 }, cores: [{ busy: 10, all: 100 }] })
  },
  "cpuLoad is the busy share of the ticks between two samples"() {
    const a = { total: { busy: 100, all: 1000 }, cores: [{ busy: 0, all: 100 }, { busy: 50, all: 100 }] }
    const b = { total: { busy: 175, all: 1100 }, cores: [{ busy: 50, all: 150 }, { busy: 50, all: 200 }] }
    assert.deepEqual(plain(Stats.cpuLoad(a, b)), { total: 75, cores: [100, 0] })
    assert.deepEqual(plain(Stats.cpuLoad(a, a)), { total: 0, cores: [0, 0] })
  },
  "parseMeminfo reports used as total less available, in bytes"() {
    const memory = Stats.parseMeminfo(Stats.parseFrame(frame(1, [0])).meminfo)
    assert.equal(memory.total, 63412576 * 1024)
    assert.equal(memory.used, (63412576 - 35827448) * 1024)
    assert.equal(memory.available, 35827448 * 1024)
    assert.equal(memory.cached, (36056908 + 3676) * 1024)
    assert.equal(memory.swapUsed, 0)
  },
  "defaultInterface follows the default route, the lowest metric first"() {
    const lines = Stats.parseFrame(frame(1, [0])).route
    assert.equal(Stats.defaultInterface(lines), "eno1")
    assert.equal(Stats.defaultInterface([lines[0], "wlan0\t00000000\t0\t3\t0\t0\t600\t00000000", "eth1\t00000000\t0\t3\t0\t0\t50\t00000000"]), "eth1")
    assert.equal(Stats.defaultInterface([lines[0]]), "")
  },
  "parseNetDev reads byte counters, glued colons and all"() {
    const net = Stats.parseNetDev(Stats.parseFrame(frame(0, [0])).net)
    assert.deepEqual(plain(net.eno1), { rx: 29099514268, tx: 1410672755 })
    assert.deepEqual(plain(net.lo), { rx: 173185512, tx: 173185512 })
  },
  "parseDiskstats keeps whole disks only, in bytes"() {
    const disks = Stats.parseDiskstats(Stats.parseFrame(frame(0, [0])).disk)
    assert.deepEqual(Object.keys(disks), ["sda", "nvme0n1"])
    assert.deepEqual(plain(disks.nvme0n1), { read: 43858112 * 512, written: 5502352 * 512 })
  },
  "parsePressure reads the some avg10 stall of each resource"() {
    const pressure = Stats.parsePressure(Stats.parseFrame(frame(0, [0])).psi)
    assert.deepEqual(plain(pressure), { cpu: 0.12, memory: 1.5, io: 4 })
  },
  "parseSensors finds the CPU temperature, fans and NVMe temperatures"() {
    const sections = Stats.parseFrame(frame(0, [0]))
    const sensors = Stats.parseSensors(sections.hwmon, sections.nvme)
    assert.equal(sensors.cpuTemp, 67.375)
    assert.deepEqual(plain(sensors.fans), [{ name: "CPU fan", rpm: 1210 }])
    assert.deepEqual(plain(sensors.nvme), { nvme0: 34.85, nvme1: 42.85 })
    // coretemp names its package, other chips their first sensor.
    assert.equal(Stats.parseSensors(["coretemp\ttemp2\tCore 0\t50000", "coretemp\ttemp1\tPackage id 0\t55000"], []).cpuTemp, 55)
    assert.equal(Stats.parseSensors(["cpu_thermal\ttemp1\t\t48000"], []).cpuTemp, 48)
    assert.equal(Stats.parseSensors([], []).cpuTemp, null)
  },
  "averageFrequency is in MHz"() {
    assert.equal(Stats.averageFrequency(["5399595", "4800000"]), 5099.7975)
    assert.equal(Stats.averageFrequency([]), null)
  },
  "parseGpu reads nvidia-smi's CSV, with N/A as null"() {
    const gpu = Stats.parseGpu("0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 12")
    assert.deepEqual(plain(gpu), {
      index: 0, name: "RTX 4080", load: 55, memUsed: 7551 * 1048576, memTotal: 16376 * 1048576,
      temp: 54, power: 149.65, powerLimit: 320, clock: 2790, fan: 30, encoder: 0, decoder: 12
    })
    assert.equal(Stats.parseGpu("0, Tesla T4, 3, 100, 15360, 40, [N/A], [Not Supported], 300, [N/A], 0, 0").fan, null)
    assert.equal(Stats.parseGpu("NVIDIA-SMI has failed"), null)
  },
  "parseGpuApps lists apps by video memory, with short names"() {
    const apps = Stats.parseGpuApps([
      "407143, S:\\steamapps\\common\\MGSDelta\\Binaries\\Win64\\MGSDelta-Win64-Shipping.exe, 7204",
      "2211, /usr/bin/python3, 812",
      "No running processes found"
    ])
    assert.deepEqual(plain(apps), [
      { pid: 407143, name: "MGSDelta-Win64-Shipping", memory: 7204 * 1048576 },
      { pid: 2211, name: "python3", memory: 812 * 1048576 }
    ])
  },
  "parseProcs reads each process's name and CPU ticks"() {
    const procs = Stats.parseProcs([
      "1234 (Web Content) S 1 2 3 4 5 6 7 8 9 10 300 50 0 0 20 0 1 0",
      "77 (a) b) R 1 2 3 4 5 6 7 8 9 10 5 5 0 0 20 0 1 0",
      "garbage"
    ])
    assert.deepEqual(plain(procs), { 1234: { name: "Web Content", ticks: 350 }, 77: { name: "a) b", ticks: 10 } })
  },
  "topProcesses ranks CPU use since the last sample, as top does"() {
    const before = { 1: { name: "game", ticks: 100 }, 2: { name: "idle", ticks: 5 }, 3: { name: "gone", ticks: 1 } }
    const after = { 1: { name: "game", ticks: 400 }, 2: { name: "idle", ticks: 5 }, 4: { name: "new", ticks: 50 } }
    // 300 ticks at 100 Hz over 2 s is 150% of one core; a new process
    // counts from 0 only if it started since, so it is left out.
    assert.deepEqual(plain(Stats.topProcesses(before, after, 2, 5)), [{ pid: 1, name: "game", cpu: 150, count: 1 }])
  },
  "topProcesses adds up processes of the same name"() {
    const before = { 1: { name: "brave", ticks: 0 }, 2: { name: "brave", ticks: 0 }, 3: { name: "game", ticks: 0 } }
    const after = { 1: { name: "brave", ticks: 30 }, 2: { name: "brave", ticks: 50 }, 3: { name: "game", ticks: 60 } }
    assert.deepEqual(plain(Stats.topProcesses(before, after, 1, 5)), [
      { pid: 2, name: "brave", cpu: 80, count: 2 },
      { pid: 3, name: "game", cpu: 60, count: 1 }
    ])
  },
  "history keeps the last samples, oldest first"() {
    let series = []
    for (let i = 1; i <= 5; i++) series = Stats.pushHistory(series, i, 3)
    assert.deepEqual(plain(series), [3, 4, 5])
  },
  "ingest turns two frames into loads and rates"() {
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(100, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, null)
    assert.equal(state.network.rx, null)
    assert.equal(state.memory.used, (63412576 - 35827448) * 1024)
    state = Stats.ingest(state, Stats.parseFrame(frame(102, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, 50)
    assert.equal(state.cpu.cores.length, 2)
    assert.equal(state.cpu.temp, 67.375)
    assert.deepEqual(plain(state.cpu.loadavg), [0.52, 0.61, 0.7])
    assert.equal(state.network.interface, "eno1")
    assert.equal(state.network.rx, 1000)
    assert.equal(state.network.tx, 100)
    const nvme = state.disks.find(disk => disk.name === "nvme0n1")
    assert.deepEqual(plain(nvme), { name: "nvme0n1", model: "KINGSTON SFYRDK2000G", read: 1024, write: 0, temp: 34.85 })
    assert.equal(state.disks.find(disk => disk.name === "sda").temp, null)
    assert.deepEqual(plain(state.history.cpu), [50])
    assert.deepEqual(plain(state.history.rx), [1000])
    assert.equal(state.history.memory.length, 2)
  },
  "ingest starts the rates over after a long gap"() {
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(100, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0])))
    state = Stats.ingest(state, Stats.parseFrame(frame(200, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, null)
    assert.equal(state.network.rx, null)
  },
  "ingest ranks processes when the frame carries them"() {
    const procs = ticks => `@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 ${ticks} 0 0 0\n@gpuapps\n1, /opt/game, 512\n`
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(10, [0], procs(100))))
    assert.deepEqual(plain(state.processes), [])
    state = Stats.ingest(state, Stats.parseFrame(frame(11, [0])))
    assert.deepEqual(plain(state.processes), [])
    state = Stats.ingest(state, Stats.parseFrame(frame(13, [0], procs(400))))
    assert.deepEqual(plain(state.processes), [{ pid: 1, name: "game", cpu: 100, count: 1 }])
    assert.deepEqual(plain(state.gpuApps), [{ pid: 1, name: "game", memory: 512 * 1048576 }])
  },
  "ingestGpu keeps the NVIDIA GPU with the lowest index"() {
    let state = Stats.ingestGpu(Stats.empty(), "1, NVIDIA GeForce RTX 3060, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9")
    state = Stats.ingestGpu(state, "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    state = Stats.ingestGpu(state, "1, NVIDIA GeForce RTX 3060, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9")
    state = Stats.ingestGpu(state, "garbage")
    assert.equal(state.nvidia.name, "RTX 4080")
  },
  "parseDrm reads AMD and Intel cards from stats.sh"() {
    const cards = Stats.parseDrm([
      "card2\tamdgpu\tstatus\tactive", "card2\tamdgpu\tbusy\t99", "card2\tamdgpu\tvram_total\t2147483648",
      "card0\ti915\tfreq_mhz\t1300", "card0\ti915\tidle_ms\t5000",
      "card3\tamdgpu\tstatus\tsuspended"
    ])
    assert.deepEqual(plain(cards.card2), { driver: "amdgpu", status: "active", busy: 99, vram_total: 2147483648 })
    assert.equal(cards.card0.idle_ms, 5000)
    assert.equal(cards.card3.status, "suspended")
  },
  "drmGpus turns cards into GPUs, integrated or discrete"() {
    const sections = Stats.parseFrame(frame(0, [0]))
    const [amd] = plain(Stats.drmGpus(Stats.parseDrm(sections.drm), {}, 0))
    assert.deepEqual(amd, {
      id: "card2", vendor: "AMD", name: "Radeon Graphics", kind: "integrated", asleep: false,
      load: 99, memUsed: 1228115968, memTotal: 2147483648, temp: 60, power: 0.157, powerLimit: null,
      clock: 2200, fan: null, encoder: null, decoder: null
    })
    // An AMD card with 4 GiB of VRAM or more is a discrete one, and its fan
    // speed comes from its PWM duty.
    const big = Stats.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 40, vram_total: 17163091968, pwm: 102, power_cap: 300000000 } }, {}, 0)[0]
    assert.equal(big.kind, "discrete")
    assert.equal(big.name, "Radeon")
    assert.equal(big.fan, 40)
    assert.equal(big.powerLimit, 300)
    // A sleeping card is reported asleep, with no readings.
    const asleep = Stats.drmGpus({ card3: { driver: "amdgpu", status: "suspended" } }, {}, 0)[0]
    assert.equal(asleep.asleep, true)
    assert.equal(asleep.load, null)
  },
  "Intel load is the share of time the GPU was not idle"() {
    const now = { card0: { driver: "i915", freq_mhz: 1300, idle_ms: 5750 } }
    const [intel] = Stats.drmGpus(now, { card0: 5000 }, 1)
    assert.equal(intel.vendor, "Intel")
    assert.equal(intel.kind, "integrated")
    assert.equal(intel.load, 25)
    assert.equal(intel.clock, 1300)
    // Without a sample before, there is no load yet.
    assert.equal(Stats.drmGpus(now, {}, 1)[0].load, null)
    // xe names its counters the same once stats.sh has read them.
    assert.equal(Stats.drmGpus({ card0: { driver: "xe", idle_ms: 2000 } }, { card0: 1000 }, 2)[0].load, 50)
  },
  "gpuRoles puts the discrete GPU first and the integrated one beside it"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    let roles = Stats.gpuRoles(state)
    assert.equal(roles.main.name, "RTX 4080")
    assert.equal(roles.integrated.name, "Radeon Graphics")
    // With only the iGPU, it is the main GPU and there is no second one.
    state = Stats.step(Stats.empty(), frame(10, [0]), "")
    roles = Stats.gpuRoles(state)
    assert.equal(roles.main.name, "Radeon Graphics")
    assert.equal(roles.integrated, null)
  },
  "step applies a frame and the GPU line that came with it in one update"() {
    const gpuLine = "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"
    let state = Stats.step(Stats.empty(), frame(10, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0]), gpuLine)
    state = Stats.step(state, frame(11, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0]), "")
    assert.equal(state.cpu.total, 50)
    assert.equal(state.nvidia.load, 55)
    // The GPU history advances with the frames, one sample each.
    assert.deepEqual(plain(state.history.gpu), [55, 55])
    assert.equal(state.history.gpu.length, state.history.memory.length)
    assert.deepEqual(plain(state.history.igpu), [99, 99])
  },
  "the GPU history starts over when another GPU becomes the main one"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), "")
    assert.deepEqual(plain(state.history.gpu), [99])
    state = Stats.step(state, frame(11, [0]), "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    assert.deepEqual(plain(state.history.gpu), [55])
  },
  "parseColors reads an Omarchy colors.toml"() {
    const colors = Stats.parseColors('mode = "dark"\naccent = "#81a1c1"\n# red = "#000000"\nred = "#BF616A"\ncolor2 = \'#a3be8c\'\n')
    assert.deepEqual(plain(colors), { accent: "#81a1c1", red: "#bf616a", color2: "#a3be8c" })
  },
  "palette builds btop-style gradients from the theme's named colors"() {
    const palette = Stats.palette({ foreground: "#d8dee9", background: "#2e3440", accent: "#81a1c1", muted: "#4c566a", red: "#bf616a", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#88c0d0", blue: "#81a1c1", magenta: "#b48ead", orange: "#d5967a" })
    assert.deepEqual(plain(palette.gradients.cpu), ["#88c0d0", "#81a1c1", "#b48ead"])
    assert.deepEqual(plain(palette.gradients.temp), ["#a3be8c", "#ebcb8b", "#bf616a"])
    assert.equal(palette.boxes.cpu, "#b48ead")
    assert.equal(palette.boxes.memory, "#a3be8c")
    assert.equal(palette.foreground, "#d8dee9")
    assert.equal(palette.line, "#4c566a")
  },
  "palette falls back to the numbered colors, then the foreground"() {
    const palette = Stats.palette({ color0: "#000000", color1: "#aa0000", color2: "#00aa00", color3: "#aaaa00", color4: "#0000aa", color5: "#aa00aa", color6: "#00aaaa", color7: "#cccccc", color8: "#555555" })
    assert.deepEqual(plain(palette.gradients.temp), ["#00aa00", "#aaaa00", "#aa0000"])
    assert.equal(palette.foreground, "#cccccc")
    assert.equal(palette.line, "#555555")
    // orange falls back to yellow.
    assert.equal(palette.boxes.pressure, "#aaaa00")
    const bare = Stats.palette({}, { foreground: "#eeeeee", accent: "#3366ff" })
    assert.equal(bare.boxes.gpu, "#3366ff")
    assert.deepEqual(plain(bare.gradients.cpu), ["#3366ff", "#3366ff", "#3366ff"])
  },
  "gradientAt mixes the stops"() {
    const stops = ["#000000", "#808080", "#ffffff"]
    assert.equal(Stats.gradientAt(stops, 0), "#000000")
    assert.equal(Stats.gradientAt(stops, 0.5), "#808080")
    assert.equal(Stats.gradientAt(stops, 0.25), "#404040")
    assert.equal(Stats.gradientAt(stops, 2), "#ffffff")
    assert.equal(Stats.gradientAt(stops, -1), "#000000")
  },
  "formatters"() {
    assert.equal(Stats.formatBytes(0), "0 B")
    assert.equal(Stats.formatBytes(1536), "1.5 KiB")
    assert.equal(Stats.formatBytes(7551 * 1048576), "7.4 GiB")
    assert.equal(Stats.formatBytes(150 * 1048576), "150 MiB")
    assert.equal(Stats.formatRate(2048), "2.0 KiB/s")
    assert.equal(Stats.formatRate(null), "—")
    assert.equal(Stats.formatPercent(54.6), "55%")
    assert.equal(Stats.formatPercent(null), "—")
    assert.equal(Stats.formatTemp(67.375), "67°C")
    assert.equal(Stats.formatTemp(null), "—")
    assert.equal(Stats.formatFrequency(5099.8), "5.10 GHz")
    assert.equal(Stats.formatFrequency(800), "800 MHz")
    assert.equal(Stats.formatShort(0), "0")
    assert.equal(Stats.formatShort(958464), "936K")
    assert.equal(Stats.formatShort(2.1 * 1048576), "2.1M")
    assert.equal(Stats.formatShort(null), "—")
  },
  "the disks view keeps each row short"() {
    const view = Stats.view("disks", full, palette)
    const nvme = view.rows.find(row => row.label === "nvme0n1")
    assert.equal(nvme.text, "R 1.0K  W 0  35°C")
  },
  "the processes view names merged processes with their count"() {
    const state = Object.assign(Stats.empty(), { processes: [{ pid: 2, name: "brave", cpu: 80, count: 3 }] })
    assert.equal(Stats.view("processes", state, palette).lists[0].items[0].name, "brave ×3")
  },
  "unitFor sizes the dashboard's text to the strip"() {
    assert.equal(Stats.unitFor(1440, 660), 18)
    assert.equal(Stats.unitFor(2560, 96), 12)
    assert.equal(Stats.unitFor(2560, 40), 9)
  },
  "layout tiles the panels in the grid with the largest cards"() {
    // A 1440x660 top strip fits four panels two by two.
    const grid = Stats.layout(["gpu", "cpu", "memory", "network"], 1440, 660, 18)
    assert.deepEqual(plain(grid.cards.map(card => card.panel)), ["gpu", "cpu", "memory", "network"])
    assert.deepEqual(plain(grid.dropped), [])
    assert.equal(grid.cards[0].y, grid.cards[1].y)
    assert.ok(grid.cards[2].y > grid.cards[0].y)
    // A wide, short strip puts them in one row.
    const row = Stats.layout(["gpu", "cpu", "memory"], 2560, 160, 14)
    assert.equal(new Set(row.cards.map(card => card.y)).size, 1)
    // A tall side strip stacks them.
    const column = Stats.layout(["gpu", "cpu", "memory"], 320, 1600, 16)
    assert.equal(new Set(column.cards.map(card => card.x)).size, 1)
  },
  "layout keeps cards inside the strip with a margin"() {
    const grid = Stats.layout(ALL_PANELS, 1440, 660, 18)
    for (const card of grid.cards) {
      assert.ok(card.x >= 18 && card.y >= 18, JSON.stringify(card))
      assert.ok(card.x + card.width <= 1440 - 18 + 0.01 && card.y + card.height <= 660 - 18 + 0.01, JSON.stringify(card))
    }
  },
  "layout stretches a short last row across the strip"() {
    const grid = Stats.layout(["gpu", "cpu", "memory"], 1440, 660, 18)
    const last = grid.cards[grid.cards.length - 1]
    if (last.y !== grid.cards[0].y) assert.equal(Math.round(last.x + last.width), 1440 - 18)
  },
  "fit shrinks the text until every card has room for its content"() {
    // Four panels on the 1080x660 strip keep the largest text.
    assert.equal(Stats.fit(["gpu", "cpu", "memory", "network"], 1080, 660).unit, 18)
    // Eight panels make a 3x3 grid; the text shrinks to fit stacked cards.
    const dense = Stats.fit(ALL_PANELS, 1080, 660)
    assert.ok(dense.unit < 18)
    assert.equal(dense.cards.length, ALL_PANELS.length)
    for (const card of dense.cards) assert.ok(card.height >= Stats.CARD_ROOM * dense.unit, JSON.stringify(card))
    // A short, wide strip gets wide cards, which need less height.
    const strip = Stats.fit(["gpu", "cpu", "memory", "network"], 2560, 160)
    assert.equal(strip.cards.length, 4)
    assert.ok(strip.cards[0].width > strip.cards[0].height * Stats.WIDE_CARD)
    assert.ok(strip.cards[0].height >= Stats.WIDE_ROOM * strip.unit)
    // When nothing makes room, the smallest text still shows what fits.
    const tiny = Stats.fit(ALL_PANELS, 600, 120)
    assert.equal(tiny.unit, 9)
    assert.ok(tiny.cards.length > 0)
  },
  "layout drops the last panels when they do not fit"() {
    const grid = Stats.layout(["gpu", "cpu", "memory", "network", "disks"], 600, 120, 12)
    assert.ok(grid.cards.length < 5)
    assert.deepEqual(plain(grid.dropped), ["gpu", "cpu", "memory", "network", "disks"].slice(grid.cards.length))
    assert.deepEqual(plain(Stats.layout(["gpu"], 50, 50, 9).dropped), ["gpu"])
    assert.deepEqual(plain(Stats.layout([], 1440, 660, 18).cards), [])
  },
}

// A view for every panel, from a state with data and from an empty one.
const palette = Stats.palette({ foreground: "#d8dee9", accent: "#81a1c1", red: "#bf616a", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#88c0d0", blue: "#81a1c1", magenta: "#b48ead" })
let full = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(10, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0], "@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 100 0 0 0\n")))
full = Stats.step(full, frame(11, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0], "@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 150 0 0 0\n@gpuapps\n1, /opt/game, 512\n"),
  "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 12")
ALL_PANELS.forEach(panel => {
  tests["view of " + panel + " has a title, a box color and content"] = () => {
    const view = Stats.view(panel, full, palette)
    assert.ok(view.title && view.icon, panel)
    assert.match(view.color, /^#[0-9a-f]{6}$/)
    assert.equal(view.empty, "", panel + " should have data")
    assert.ok(view.rows.length + view.lists.length + view.bars.length + view.graphs.length > 0, panel)
    for (const row of view.rows) assert.ok(row.fraction === null || (row.fraction >= 0 && row.fraction <= 1), JSON.stringify(row))
    const empty = Stats.view(panel, Stats.empty(), palette)
    assert.equal(empty.title, view.title)
  }
})

Object.assign(tests, {
  "the GPU view shows load, memory, temperature and power"() {
    const view = Stats.view("gpu", full, palette)
    assert.equal(view.value, "55%")
    assert.equal(view.info, "RTX 4080")
    const labels = view.rows.map(row => row.label)
    for (const label of ["VRAM", "Temp", "Power", "Clock", "Fan", "Decode"]) assert.ok(labels.includes(label), label)
    // An idle encoder is left out.
    assert.ok(!labels.includes("Encode"))
    assert.equal(view.rows.find(row => row.label === "VRAM").text, "7.4 / 16.0 GiB")
    assert.equal(view.rows.find(row => row.label === "Power").text, "150 / 320 W")
  },
  "the GPU view says so when there is no GPU"() {
    assert.equal(Stats.view("gpu", Stats.empty(), palette).empty, "Waiting for data")
    assert.equal(Stats.view("gpu", Object.assign(Stats.empty(), { time: 1, nvidiaMissing: true }), palette).empty, "No GPU found")
  },
  "the GPU view shows an AMD card the same way"() {
    const state = Stats.step(Stats.empty(), frame(10, [0]), "")
    const view = Stats.view("gpu", state, palette)
    assert.equal(view.info, "Radeon Graphics")
    assert.equal(view.value, "99%")
    assert.equal(view.rows.find(row => row.label === "Power").text, "0.2 W")
    assert.equal(view.rows.find(row => row.label === "VRAM").text, "1.1 / 2.0 GiB")
  },
  "the iGPU view shows the integrated GPU beside a discrete one"() {
    const view = Stats.view("igpu", full, palette)
    assert.equal(view.title, "iGPU")
    assert.equal(view.info, "Radeon Graphics")
    assert.equal(view.value, "99%")
    assert.deepEqual(plain(view.graphs[0].values), [99])
    // Alone, the iGPU is the GPU panel's.
    const alone = Stats.step(Stats.empty(), frame(10, [0]), "")
    assert.equal(Stats.view("igpu", alone, palette).empty, "Shown as GPU")
    assert.equal(Stats.view("igpu", Object.assign(Stats.empty(), { time: 1 }), palette).empty, "No integrated GPU")
  },
  "an asleep GPU says so"() {
    const state = Object.assign(Stats.empty(), { time: 1, drm: Stats.drmGpus({ card1: { driver: "amdgpu", status: "suspended" } }, {}, 0) })
    assert.equal(Stats.view("gpu", state, palette).empty, "Asleep")
  },
  "the CPU view has a bar per core colored by load"() {
    const view = Stats.view("cpu", full, palette)
    assert.equal(view.bars.length, 2)
    assert.equal(view.value, "50%")
    assert.equal(view.info, "2 threads")
  },
  "the processes view lists CPU and GPU apps"() {
    const view = Stats.view("processes", full, palette)
    assert.deepEqual(plain(view.lists.map(list => list.title)), ["CPU", "VRAM"])
    assert.equal(view.lists[0].items[0].name, "game")
    assert.equal(view.lists[0].items[0].text, "50%")
  },
  "the fans view adds the GPU fan"() {
    const view = Stats.view("fans", full, palette)
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["CPU fan", "GPU"])
    assert.equal(view.rows[1].text, "30%")
  },
  "the fans view leads with the GPU fan and its history"() {
    const view = Stats.view("fans", full, palette)
    assert.equal(view.value, "30%")
    assert.equal(view.caption, "GPU fan")
    assert.equal(view.graphs.length, 1)
    assert.deepEqual(plain(view.graphs[0].values), [30])
    // Without a GPU there is no headline, just the rows.
    const bare = Object.assign(Stats.empty(), { fans: [{ name: "CPU fan", rpm: 900 }] })
    assert.equal(Stats.view("fans", bare, palette).value, "")
  },
  "the GPU fan history advances with the frames"() {
    const gpuLine = "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"
    let state = Stats.step(Stats.empty(), frame(10, [0]), gpuLine)
    state = Stats.step(state, frame(11, [0]), "")
    assert.deepEqual(plain(state.history.fan), [30, 30])
  },
  "the processes view fills the room it is given"() {
    const many = Array.from({ length: 12 }, (_, i) => ({ pid: i + 1, name: "p" + i, cpu: 50 - i, count: 1 }))
    const apps = Array.from({ length: 5 }, (_, i) => ({ pid: i + 1, name: "a" + i, memory: 1048576 * (5 - i) }))
    const state = Object.assign(Stats.empty(), { processes: many, gpuApps: apps, nvidia: full.nvidia })
    // Room for 12 rows: two list titles, three apps, seven programs.
    let view = Stats.view("processes", state, palette, 12)
    assert.equal(view.lists[0].items.length, 7)
    assert.equal(view.lists[1].items.length, 3)
    // Little room still shows the busiest program and app.
    view = Stats.view("processes", state, palette, 3)
    assert.equal(view.lists[0].items.length, 1)
    assert.equal(view.lists[1].items.length, 1)
    // Without a room given, the usual five and three.
    view = Stats.view("processes", state, palette)
    assert.equal(view.lists[0].items.length, 5)
    assert.equal(view.lists[1].items.length, 3)
  },
})

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
