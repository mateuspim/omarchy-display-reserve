import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Mpris
import qs.Commons
import "Model.js" as Model
import "Stats.js" as Stats

// The stats fill's data: runs stats.sh (and nvidia-smi for the GPU) while
// `running` and keeps what they print in `data` (Stats.ingest), with the
// theme's colors in `palette`. One instance, in ReserveState, serves every
// monitor and panel preview.
QtObject {
  id: root

  property bool running: false
  // Whether a panel on screen lists processes, which costs a pass over
  // /proc, and whether one reads nvidia-smi.
  property bool processes: false
  property bool gpu: false
  // Whether a panel shows the track playing, from the MPRIS players.
  property bool media: false
  property var data: Stats.empty()

  // Seconds between frames, and frames between process lists.
  readonly property real interval: 1
  readonly property int processEvery: 3
  readonly property string script: decodeURIComponent(String(Qt.resolvedUrl("stats.sh")).replace(/^file:\/\//, ""))

  // A process that stops while still wanted is started again after a
  // pause; bumping the epoch re-evaluates its `running` binding.
  property int samplerEpoch: 0
  property int gpuEpoch: 0
  // Restarting stats.sh for a new argument: off for a moment, then on.
  property bool restarting: false
  onProcessesChanged: if (sampler.running) { restarting = true; restartTimer.restart() }

  property Process sampler: Process {
    command: ["bash", root.script, String(root.interval), root.processes ? String(root.processEvery) : "0"]
    running: root.running && !root.restarting && root.samplerEpoch >= 0
    stdout: SplitParser {
      splitMarker: "@end\n"
      onRead: function(frame) {
        root.data = Stats.step(root.data, frame, root.gpuLines, root.media ? root.track() : null)
        root.gpuLines = []
      }
    }
    onExited: if (root.running && !root.restarting) samplerRetry.restart()
  }

  // Found once, the first time a panel needs it: whether there is an
  // nvidia-smi to run at all.
  property bool hasNvidia: false
  property bool nvidiaChecked: false
  property Process nvidiaCheck: Process {
    command: ["bash", "-c", "type -P nvidia-smi"]
    running: root.running && root.gpu && !root.nvidiaChecked
    onExited: function(code) {
      root.nvidiaChecked = true
      root.hasNvidia = code === 0
      if (!root.hasNvidia) root.data = Object.assign({}, root.data, { nvidiaMissing: true })
    }
  }

  // nvidia-smi's own loop: one process, a line per second, instead of a
  // new process each time. Its line waits for the next stats.sh frame, so
  // the dashboard changes once a second, all at once.
  // nvidia-smi prints a line per GPU each time; all of them wait.
  property var gpuLines: []
  // Runs of nvidia-smi that ended without printing a line: it is there but
  // cannot reach the driver. After a few, the GPU counts as missing.
  property int gpuFailures: 0
  property bool gpuPrinted: false
  property Process gpuProcess: Process {
    command: ["nvidia-smi",
      "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,clocks.gr,fan.speed,utilization.encoder,utilization.decoder",
      "--format=csv,noheader,nounits", "-lms", String(Math.round(root.interval * 1000))]
    running: root.running && root.gpu && root.hasNvidia && root.gpuEpoch >= 0
    stdout: SplitParser {
      onRead: function(line) {
        root.gpuLines = root.gpuLines.concat([line])
        root.gpuPrinted = true
        root.gpuFailures = 0
      }
    }
    onRunningChanged: if (running) root.gpuPrinted = false
    onExited: {
      if (!root.gpuPrinted && ++root.gpuFailures >= 3) {
        root.hasNvidia = false
        root.data = Object.assign({}, root.data, { nvidiaMissing: true })
        return
      }
      if (root.running && root.gpu) gpuRetry.restart()
    }
  }

  // The track of the player Stats.pickPlayer picks; null without players.
  // Read once a frame, so its position moves on.
  function track() {
    var player = Stats.pickPlayer(Mpris.players.values)
    if (!player) return null
    return {
      identity: player.identity, title: player.trackTitle, artist: player.trackArtist, album: player.trackAlbum,
      art: player.trackArtUrl, playing: player.isPlaying,
      position: player.positionSupported ? player.position : null,
      length: player.lengthSupported ? player.length : null
    }
  }

  property Timer restartTimer: Timer {
    interval: 200
    onTriggered: root.restarting = false
  }
  property Timer samplerRetry: Timer {
    interval: 5000
    onTriggered: root.samplerEpoch++
  }
  property Timer gpuRetry: Timer {
    interval: 5000
    onTriggered: root.gpuEpoch++
  }

  // The theme's named colors. The shell reads colors.toml only at startup
  // and takes theme switches over IPC into Color, which keeps just five
  // of them; so the file is read again whenever those change, by when
  // Omarchy has put the new theme in place.
  property var colors: ({})
  readonly property string themeColors: String(Color.foreground) + String(Color.background) + String(Color.accent) + String(Color.urgent) + String(Color.muted)
  onThemeColorsChanged: themeFile.reload()
  readonly property var palette: Stats.palette(colors, {
    foreground: hex(Color.foreground), background: hex(Color.background),
    accent: hex(Color.accent), urgent: hex(Color.urgent), muted: hex(Color.muted)
  })
  function hex(color) { return Model.hexColor(color.r, color.g, color.b) }

  property FileView themeFile: FileView {
    path: Color.currentThemePath + "/colors.toml"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.colors = Stats.parseColors(text())
    onLoadFailed: root.colors = ({})
  }
}
