import QtQuick
import "." as Reserve
import "Stats.js" as Stats

// A number that eases to `target` over `duration` ms each time it changes,
// moved by the sampler's clock, so it moves at the frame pace chosen for
// the dashboard (StatsSampler.pace), or jumps when there is no animation.
QtObject {
  id: root
  property real target: 0
  property int duration: 800
  readonly property var clock: Reserve.ReserveState.stats
  property real from: 0
  property real to: 0
  property real start: 0
  readonly property real value: clock.animated
    ? from + (to - from) * Stats.ease(Stats.progress(clock.now, start, duration))
    : target
  // `value` is read before the change lands in `from`, `to` and `start`,
  // so a new target picks up from wherever the last one had got to.
  onTargetChanged: { from = value; to = target; start = clock.now }
  Component.onCompleted: { from = target; to = target }
}
