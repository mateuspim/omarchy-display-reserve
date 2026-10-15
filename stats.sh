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

export LC_ALL=C
interval=${1:-1}
every=${2:-0}
frames=${3:-0}

# Lines of a file, quietly: sensors and processes come and go.
dump() {
  local line
  while IFS= read -r line || [[ -n $line ]]; do printf '%s\n' "$line"; done < "$1"
} 2>/dev/null

# Only CPU temperature chips are read for temperatures: reading another
# device's sensors can wake it from a low-power state.
cpu_chip='^(k10temp|zenpower|coretemp|k8temp|cpu_thermal|acpitz)$'
nvidia=$(type -P nvidia-smi)

# A pipe nobody writes to, for sleeping with read -t instead of forking
# sleep on every frame.
exec {sleeper}<> <(:)

n=0
while :; do
  printf '@time %s\n' "$EPOCHREALTIME"

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
  for dir in /sys/class/hwmon/hwmon*; do
    read -r chip < "$dir/name" 2>/dev/null || continue
    inputs=("$dir"/fan*_input)
    [[ $chip =~ $cpu_chip ]] && inputs+=("$dir"/temp*_input)
    for input in "${inputs[@]}"; do
      [[ -e $input ]] || continue
      sensor=${input##*/}
      sensor=${sensor%_input}
      label="" value=""
      [[ -r $dir/${sensor}_label ]] && read -r label < "$dir/${sensor}_label"
      read -r value < "$input" 2>/dev/null
      printf '%s\t%s\t%s\t%s\n' "$chip" "$sensor" "$label" "$value"
    done
  done

  printf '@nvme\n'
  for input in /sys/class/nvme/nvme*/hwmon*/temp1_input; do
    [[ -e $input ]] || continue
    controller=${input#/sys/class/nvme/}
    value=""
    read -r value < "$input" 2>/dev/null
    printf '%s\t%s\n' "${controller%%/*}" "$value"
  done

  printf '@freq\n'
  for input in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq; do
    [[ -r $input ]] && read -r value < "$input" && printf '%s\n' "$value"
  done

  # AMD and Intel GPUs, by card; NVIDIA's come from nvidia-smi. A card the
  # kernel put to sleep only reports that: reading it would wake it.
  printf '@drm\n'
  for card in /sys/class/drm/card*; do
    id=${card##*/}
    [[ $id == *-* ]] && continue
    dev=$card/device
    driver=""
    while IFS='=' read -r key value; do [[ $key == DRIVER ]] && driver=$value; done < "$dev/uevent" 2>/dev/null
    [[ $driver == amdgpu || $driver == i915 || $driver == xe ]] || continue
    status=""
    [[ -r $dev/power/runtime_status ]] && read -r status < "$dev/power/runtime_status"
    gpu() { [[ -r $2 ]] && read -r value < "$2" && printf '%s\t%s\t%s\t%s\n' "$id" "$driver" "$1" "$value"; }
    printf '%s\t%s\tstatus\t%s\n' "$id" "$driver" "${status:-active}"
    [[ $status == suspended ]] && continue
    gpu vram_used "$dev/mem_info_vram_used"
    gpu vram_total "$dev/mem_info_vram_total"
    if [[ $driver == amdgpu ]]; then
      gpu busy "$dev/gpu_busy_percent"
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
      "$nvidia" --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null
    fi
  fi

  printf '@end\n'
  (( ++n == frames )) && break
  read -t "$interval" -u "$sleeper"
done
