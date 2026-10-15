#!/usr/bin/env bash
# The stats fill's sampler: prints a frame of system counters every
# INTERVAL seconds, for Stats.parseFrame. It reads /proc and /sys with
# builtins only, so a frame costs no new processes, apart from one
# nvidia-smi call for the GPU's apps on frames that list processes.
#
#   stats.sh INTERVAL PROCESS_EVERY [FRAMES]
#
# PROCESS_EVERY: list every process (and GPU app) on every Nth frame,
# starting with the first; 0 never does. FRAMES: stop after that many
# frames; 0 or none runs until the shell closes the pipe.
# STATS_NVIDIA=0 in the environment leaves nvidia-smi out: the shell sets
# it while the NVIDIA GPU rests or sleeps, since asking wakes it.

export LC_ALL=C
interval=${1:-1}
every=${2:-0}
frames=${3:-0}

# Lines of a file, quietly: sensors and processes come and go.
dump() {
  local line
  while IFS= read -r line || [[ -n $line ]]; do printf '%s\n' "$line"; done < "$1"
} 2>/dev/null

# Only the CPU's and memory modules' temperature chips are read: reading
# another device's sensors can wake it from a low-power state.
# ACPI thermal zones are left out: reading one runs firmware code.
temp_chip='^(k10temp|zenpower|coretemp|k8temp|cpu_thermal|spd5118|jc42)$'
# Chips read every fifth frame only: a Dell's fans are read through the
# firmware (SMM), which stalls every core for the moment it takes.
slow_chip='^(dell_smm)$'
nvidia=$(type -P nvidia-smi)
[[ ${STATS_NVIDIA:-1} == 0 ]] && nvidia=""
# Frames in a row each AMD card that can power itself down read idle;
# after five it is read only every tenth frame, so it can go to sleep.
declare -A rest

# A hwmon chip's lines (chip, sensor, label, value): its fans, and its
# temperatures when it is the CPU's or memory's. A device asleep is left
# alone: reading its sensors would wake it.
sensors() {
  local dir=$1 chip=$2 status="" input sensor label value
  { read -r status < "$dir/device/power/runtime_status"; } 2>/dev/null
  [[ $status == suspended ]] && return
  local inputs=("$dir"/fan*_input)
  [[ $chip =~ $temp_chip ]] && inputs+=("$dir"/temp*_input)
  for input in "${inputs[@]}"; do
    [[ -e $input ]] || continue
    sensor=${input##*/}
    sensor=${sensor%_input}
    label="" value=""
    [[ -r $dir/${sensor}_label ]] && read -r label < "$dir/${sensor}_label"
    { read -r value < "$input"; } 2>/dev/null
    printf '%s\t%s\t%s\t%s\n' "$chip" "$sensor" "$label" "$value"
  done
}

# A pipe nobody writes to, for sleeping with read -t instead of forking
# sleep on every frame.
exec {sleeper}<> <(:)

n=0
while :; do
  # Seconds since boot: unlike the wall clock, it never jumps back or
  # ahead, so the rates hold across a clock change.
  read -r uptime _ < /proc/uptime
  printf '@time %s\n' "$uptime"

  printf '@stat\n'
  while IFS= read -r line; do
    [[ $line == cpu* ]] || break
    printf '%s\n' "$line"
  done < /proc/stat

  printf '@loadavg\n'; dump /proc/loadavg
  printf '@meminfo\n'; dump /proc/meminfo
  printf '@route\n'; dump /proc/net/route
  printf '@net\n'; dump /proc/net/dev
  printf '@disk\n'; dump /proc/diskstats

  printf '@model\n'
  for dir in /sys/block/*; do
    model=""
    [[ -r $dir/device/model ]] && read -r model < "$dir/device/model"
    [[ -n $model ]] && printf '%s\t%s\n' "${dir##*/}" "$model"
  done

  printf '@psi\n'
  for resource in cpu memory io; do
    [[ -r /proc/pressure/$resource ]] || continue
    while IFS= read -r line; do printf '%s %s\n' "$resource" "$line"; done < "/proc/pressure/$resource"
  done

  printf '@hwmon\n'
  slow=()
  for dir in /sys/class/hwmon/hwmon*; do
    { read -r chip < "$dir/name"; } 2>/dev/null || continue
    if [[ $chip =~ $slow_chip ]]; then slow+=("$dir"); continue; fi
    sensors "$dir" "$chip"
  done

  # Every fifth frame: each read sends the drive a command, which wakes a
  # laptop's SSD from its deepest power state.
  if (( n % 5 == 0 )); then
    printf '@slowhwmon\n'
    for dir in "${slow[@]}"; do
      { read -r chip < "$dir/name"; } 2>/dev/null && sensors "$dir" "$chip"
    done
    printf '@nvme\n'
    for input in /sys/class/nvme/nvme*/hwmon*/temp1_input; do
      [[ -e $input ]] || continue
      controller=${input#/sys/class/nvme/}
      value=""
      { read -r value < "$input"; } 2>/dev/null
      printf '%s\t%s\n' "${controller%%/*}" "$value"
    done
  fi

  printf '@freq\n'
  for input in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq; do
    [[ -r $input ]] && read -r value < "$input" && printf '%s\n' "$value"
  done

  printf '@system\n'
  for key in hostname:/proc/sys/kernel/hostname kernel:/proc/sys/kernel/osrelease uptime:/proc/uptime; do
    value=""
    { read -r value < "${key#*:}"; } 2>/dev/null && printf '%s\t%s\n' "${key%%:*}" "$value"
  done

  # Batteries, the laptop's and peripherals', and power adapters.
  printf '@power\n'
  for supply in /sys/class/power_supply/*; do
    [[ -d $supply ]] || continue
    for key in type scope status capacity capacity_level model_name power_now current_now voltage_now energy_now energy_full charge_now charge_full; do
      [[ -r $supply/$key ]] || continue
      value=""
      { read -r value < "$supply/$key"; } 2>/dev/null && printf '%s\t%s\t%s\n' "${supply##*/}" "$key" "$value"
    done
  done

  # AMD and Intel GPUs, by card; NVIDIA's come from nvidia-smi, and only
  # say here whether they sleep. A card the kernel put to sleep only
  # reports that: reading it would wake it.
  printf '@drm\n'
  for card in /sys/class/drm/card*; do
    id=${card##*/}
    [[ $id == *-* ]] && continue
    dev=$card/device
    driver=""
    { while IFS='=' read -r key value; do [[ $key == DRIVER ]] && driver=$value; done < "$dev/uevent"; } 2>/dev/null
    [[ $driver == amdgpu || $driver == i915 || $driver == xe || $driver == nvidia ]] || continue
    status="" control=""
    [[ -r $dev/power/runtime_status ]] && read -r status < "$dev/power/runtime_status"
    [[ -r $dev/power/control ]] && read -r control < "$dev/power/control"
    gpu() { [[ -r $2 ]] && read -r value < "$2" && printf '%s\t%s\t%s\t%s\n' "$id" "$driver" "$1" "$value"; }
    printf '%s\t%s\tstatus\t%s\n' "$id" "$driver" "${status:-active}"
    if [[ $driver == nvidia ]]; then
      printf '%s\t%s\tcontrol\t%s\n' "$id" "$driver" "$control"
      [[ $status == suspended ]] && nvidia=""
      continue
    fi
    [[ $status == suspended ]] && continue
    # Resting: left alone but every tenth frame.
    if [[ $driver == amdgpu && $control == auto ]] && (( ${rest[$id]:-0} >= 5 && n % 10 != 0 )); then
      printf '%s\t%s\trest\t1\n' "$id" "$driver"
      continue
    fi
    gpu vram_used "$dev/mem_info_vram_used"
    gpu vram_total "$dev/mem_info_vram_total"
    if [[ $driver == amdgpu ]]; then
      # Only a discrete card's memory has a vendor.
      [[ -e $dev/mem_info_vram_vendor ]] && printf '%s\t%s\tdedicated\t1\n' "$id" "$driver"
      busy=""
      { read -r busy < "$dev/gpu_busy_percent"; } 2>/dev/null
      [[ -n $busy ]] && printf '%s\t%s\tbusy\t%s\n' "$id" "$driver" "$busy"
      if [[ $control == auto && $busy == 0 ]]; then rest[$id]=$(( ${rest[$id]:-0} + 1 )); else rest[$id]=0; fi
      for hwmon in "$dev"/hwmon/hwmon*; do
        gpu temp "$hwmon/temp1_input"
        if [[ -r $hwmon/power1_average ]]; then gpu power "$hwmon/power1_average"; else gpu power "$hwmon/power1_input"; fi
        gpu power_cap "$hwmon/power1_cap"
        gpu freq "$hwmon/freq1_input"
        gpu pwm "$hwmon/pwm1"
      done
    elif [[ $driver == i915 ]]; then
      gpu freq_mhz "$card/gt_cur_freq_mhz"
      gpu idle_ms "$card/gt/gt0/rc6_residency_ms"
    else
      gpu freq_mhz "$dev/tile0/gt0/freq0/cur_freq"
      gpu idle_ms "$dev/tile0/gt0/gtidle/idle_residency_ms"
    fi
  done

  if (( every > 0 && n % every == 0 )); then
    printf '@procs\n'
    for input in /proc/[0-9]*/stat; do
      { read -r line < "$input"; } 2>/dev/null && printf '%s\n' "$line"
    done
    if [[ -n $nvidia ]]; then
      printf '@gpuapps\n'
      # A hung driver must not stall every panel.
      timeout 2 "$nvidia" --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null
    fi
  fi

  printf '@end\n'
  (( ++n == frames )) && break
  read -t "$interval" -u "$sleeper"
done
