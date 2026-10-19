#!/usr/bin/env bash
# Lets the stats fill read the CPU's power draw, or stops it. The CPU's
# RAPL energy counter (Intel, and AMD since Zen) is root's: the kernel
# keeps it from other users, since watching it closely enough can leak
# what another program computes (Platypus, CVE-2020-8694). Enabling
# installs a udev rule that lets everyone read it from boot on, and opens
# it now; disabling takes both back.
#
#   cpu-power.sh status            none, locked or on
#   cpu-power.sh commands ACTION   the root commands ACTION runs
#   cpu-power.sh runner            sudo, or pkexec where there is no sudo
#   cpu-power.sh enable|disable    show them, ask, run them as root
#
# The panel opens enable and disable in a floating terminal, so every
# command is on screen before anything runs as root, and sudo asks for
# the password right under them.

sysfs=${CPU_POWER_SYSFS:-/sys/class/powercap}
rule_file=/etc/udev/rules.d/70-rapl-energy.rules
rule='SUBSYSTEM=="powercap", ACTION=="add", RUN+="/bin/chmod a+r /sys%p/energy_uj"'

# none: no RAPL counter (ARM, AMD before Zen, most VMs). on: every CPU
# package's counter is readable. locked: there is one, and it is root's.
status() {
  local zone found=""
  for zone in "$sysfs"/intel-rapl:*; do
    [[ ${zone##*/} =~ ^intel-rapl:[0-9]+$ && -e $zone/energy_uj ]] || continue
    found=1
    [[ -r $zone/energy_uj ]] || { echo locked; return; }
  done
  [[ -n $found ]] && echo on || echo none
}

commands() {
  case $1 in
    enable)
      printf '%s\n' "printf '%s\\n' '$rule' > $rule_file" \
        "chmod a+r /sys/class/powercap/*/energy_uj" ;;
    disable)
      printf '%s\n' "rm -f $rule_file" \
        "chmod 0400 /sys/class/powercap/*/energy_uj" ;;
  esac
}

# The CPU's draw over a second, in watts, from the packages' counters.
watts() {
  local zone energy before=0 after=0
  for zone in "$sysfs"/intel-rapl:*; do
    [[ ${zone##*/} =~ ^intel-rapl:[0-9]+$ ]] && read -r energy < "$zone/energy_uj" && (( before += energy ))
  done
  read -rt 1 <> <(:)
  for zone in "$sysfs"/intel-rapl:*; do
    [[ ${zone##*/} =~ ^intel-rapl:[0-9]+$ ]] && read -r energy < "$zone/energy_uj" && (( after += energy ))
  done
  (( after >= before )) && printf '%d.%d W\n' $(( (after - before) / 1000000 )) $(( (after - before) / 100000 % 10 ))
}

# What runs the commands as root: sudo, in the terminal they were shown
# in, or else pkexec, through the desktop's authentication dialog.
runner() {
  if command -v sudo >/dev/null; then echo sudo
  elif command -v pkexec >/dev/null; then echo pkexec
  fi
}

confirm() {
  if command -v gum >/dev/null; then gum confirm "$1"
  else local answer; read -rp "$1 [y/N] " answer; [[ $answer == [yY]* ]]; fi
}

bold() { printf '\033[1m%s\033[0m\n' "$*"; }

change() {
  local action=$1
  if [[ ! -t 0 || ! -t 1 ]]; then
    echo "cpu-power.sh $action needs a terminal to show its commands and ask first" >&2
    exit 1
  fi
  local now
  now=$(status)
  echo
  bold "OmaReach · CPU power draw"
  echo
  if [[ $now == none ]]; then
    echo "This machine has no RAPL energy counter (ARM, AMD before Zen, or a VM), so there is no CPU power draw to show."
    return 0
  fi
  if [[ $action == enable ]]; then
    [[ $now == on ]] && echo "The counter is already readable; this makes sure it stays so after a reboot."
    echo "The CPU reports its power through its RAPL energy counter, which only root"
    echo "can read. The kernel keeps it from other users because watching it closely"
    echo "enough can leak what another program computes (Platypus, CVE-2020-8694);"
    echo "on a desktop with one user that gives little away. btop asks for the same."
    echo
    echo "This lets every user read it, now and after each boot."
  else
    echo "This makes the CPU's energy counter root's again, as the kernel leaves it,"
    echo "and removes the rule that opens it at boot. The dashboard then leaves the"
    echo "power draw out."
  fi
  echo
  local run
  run=$(runner)
  if [[ -z $run ]]; then
    echo "Neither sudo nor pkexec is installed, so there is no way to run these as root."
    return 1
  fi
  bold "These commands run as root, through $run:"
  echo
  commands "$action" | sed 's/^/    /'
  echo
  if ! confirm "Run them?"; then
    echo "Nothing changed."
    return 0
  fi
  if ! "$run" /bin/sh -c "set -e; $(commands "$action")"; then
    echo
    echo "Nothing changed: $run was cancelled or refused."
    return 1
  fi
  echo
  now=$(status)
  if [[ $action == enable && $now == on ]]; then
    echo "Done. The CPU draws $(watts) right now; the dashboard shows it in a moment."
  elif [[ $action == disable && $now == locked ]]; then
    echo "Done. The counter is root's again."
  else
    echo "The commands ran, but the counter reads $now."
    return 1
  fi
}

case $1 in
  status) status ;;
  runner) runner ;;
  commands) [[ $2 == enable || $2 == disable ]] && commands "$2" || { echo "usage: cpu-power.sh commands enable|disable" >&2; exit 2; } ;;
  enable|disable) change "$1" ;;
  *) echo "usage: cpu-power.sh status | runner | commands enable|disable | enable | disable" >&2; exit 2 ;;
esac
