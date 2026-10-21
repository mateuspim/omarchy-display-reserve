# The stats fill

A live, btop-style system dashboard on one reserved edge.

<p align="center">
  <img src="../stats.png" width="540"
       alt="The top 660 pixels of a portrait monitor showing four btop-style boxes: GPU with a load graph and VRAM, temperature, power, clock and fan meters; CPU with a bar per thread, power against its limit and temperature; memory used, available, cached and swap; and network download and upload graphs">
</p>

The Stats fill shows live system numbers on one edge, as rounded boxes
with history graphs and meters:

| Panel | Shows | From |
| --- | --- | --- |
| GPU | The discrete GPU: load, video memory, temperature, power against its limit, clock, fan, video encode/decode while busy | `nvidia-smi` for NVIDIA, sysfs for AMD and Intel |
| iGPU | The integrated GPU beside it, read the same way | sysfs |
| CPU | Load and clock with a bar per thread, power draw against the CPU's limit, temperature, load average | `/proc/stat`, the CPU's hwmon sensor, RAPL, cpufreq |
| Memory | Used, available, cached, swap | `/proc/meminfo` |
| Network | Download and upload graphs, totals, on the interface of the default route | `/proc/net/dev`, `/proc/net/route` |
| Disks | Read and write per disk, NVMe temperatures | `/proc/diskstats`, NVMe hwmon |
| Processes | The busiest programs by CPU, processes of one name added up, and the apps using the most video memory | `/proc/<pid>/stat`, `nvidia-smi` |
| Temperatures | The CPU and its dies, the GPUs, NVMe drives and memory modules | hwmon, sysfs, `nvidia-smi` |
| Pressure | How much of the last 10 s tasks stalled waiting for CPU, memory or I/O | `/proc/pressure` |
| Fans | The GPU's fan with its history, and every fan sensor | hwmon, `nvidia-smi` |
| Battery | A laptop's battery with the time left, and peripherals' such as a wireless mouse or Bluetooth headphones | `/sys/class/power_supply`, the shell's UPower devices |
| Now playing | The track playing, with its cover and progress | the shell's MPRIS players |
| System | Like fastfetch: Omarchy's icon beside the uptime, OS, Omarchy version and update channel, host, kernel, CPU, GPUs, memory, packages, shell, desktop, theme, load and threads | `/proc`, `/sys`, `/etc/os-release`, pacman's database |

GPU, CPU, Memory and Network are on by default. Each card shows what fits
its size: a small one keeps its headline and the first rows, never half
of one, and a bigger one adds rows (a GPU's fan and encoder, more
temperatures, processes and system facts). Meters too narrow to read
are left out, and a narrow Disks card leaves the temperatures to the
Temperatures panel. The panels tile the edge
in the grid that gives them the most room, and the text shrinks for a
crowded one; panels that still do not fit are left off from the end of
the list above.

The GPU panel shows the discrete GPU (NVIDIA first), and the iGPU panel the
integrated one beside it; on a machine with only one GPU, that one is the
GPU panel's. AMD GPUs report everything nvidia-smi does except video
encode/decode; an AMD GPU whose memory has a vendor is discrete, and one
without, an APU whatever memory it sets aside, is integrated. Intel GPUs report no
load, so it is worked out from how long the GPU sat idle, and only the
clock besides: their temperature and power are the CPU's. A GPU the
kernel has put to sleep, such as a laptop's discrete one, shows as asleep
and is not read, since reading it would wake it. Reading an awake GPU
also keeps it awake, so a discrete GPU that can power itself down (runtime
power management on, as on most laptops) and has shown no load for 5
seconds rests: nvidia-smi stops, an AMD card is read every 10 seconds
instead of every second, and the panel shows its last reading as idle
until a reading finds it busy again.

## CPU power

The CPU's power draw comes from its RAPL energy counter (Intel, and AMD
since Zen), which the kernel lets only root read; once it can, the CPU
panel lists it first ("Power 85 / 162 W", with the clock
moving up beside the load), its meter blue through green and yellow to
red as it nears the CPU's power limit: Intel's own (PL1), or an
AMD desktop's stock PPT, looked up by model since AMD keeps it in
firmware. A laptop's or unlisted model's watts show without a meter. The panel's **CPU power · Enable** button,
shown only where there is such a counter, opens a floating terminal that
prints the root commands it would run, asks, and runs them with
`sudo`, which asks for the password right there (or `pkexec` where there
is no sudo): a udev rule that lets everyone read the counter from boot on,
as btop's docs suggest, and a `chmod` that opens it now. Once on, the
button reads **CPU power · On**, and clicking it takes both back the same
way. By hand:

```bash
echo 'SUBSYSTEM=="powercap", ACTION=="add", RUN+="/bin/chmod a+r /sys%p/energy_uj"' |
  sudo tee /etc/udev/rules.d/70-rapl-energy.rules
sudo chmod a+r /sys/class/powercap/*/energy_uj
```

The counter is root's because watching it closely enough can leak what
another program computes (Platypus, CVE-2020-8694); a desktop with one
user gives little away.

## Colors, sampling and animation

The colors come from the theme's `colors.toml`, the way Omarchy's btop
themes are built: each box has its own hue, and graphs and meters run
from cool to hot (CPU cyan, blue, magenta; temperature green, yellow,
red). Omarchy reads that file at startup and sends theme switches to the
shell over IPC, so the plugin reads it again whenever the shell's theme
colors change, and the dashboard follows a theme switch at once.

The numbers come from `stats.sh`, which prints them once a second using
shell builtins only, so it starts no process per sample, and from one
`nvidia-smi` that keeps running and prints a line a second. Process
lists come every 3 seconds and only while the Processes panel is shown.
Nothing runs unless a monitor shows the Stats fill (or the panel shows
it in its preview), and everything stops while the session is idle.
Logitech Bolt receivers are not supported by the kernel's Logitech
driver, so a mouse or keyboard on one reports no battery (Solaar reads it
directly; the panel does not).
NVMe temperatures and Dell laptops' fans, which are read through the
firmware and stall the CPU for a moment, are read every 5 seconds.

The graphs scroll and the meters ease between samples at 30 frames a
second by default, and the dashboard redraws only as often. The
Animation button under the panels (or `pace`) sets it for every monitor:
the display's own rate for the smoothest motion, 60, 30 or 15 fps, or no
animation, which redraws once a second.
