#!/usr/bin/env bash
# Генератор синтетических sysfs-фикстур для офлайн-тестов (dev-режим).
# Использование: ./fixtures/gen.sh   → создаёт fixtures/charger-100w/sys/...
# Запуск теста:  GNOME_USB_MON_SYSFS_ROOT=fixtures/charger-100w gjs -m ...
set -euo pipefail
cd "$(dirname "$0")"

ROOT="charger-100w"
rm -rf "$ROOT"

# w <path> <value> — записать значение в файл, создав директории.
w() { mkdir -p "$(dirname "$1")"; printf '%s\n' "$2" > "$1"; }

TC="$ROOT/sys/class/typec"

# port0: laptop = sink, воткнут PD-зарядник (partner присутствует).
w "$TC/port0/power_role" "source [sink]"
w "$TC/port0/data_role" "[host] device"
w "$TC/port0/power_operation_mode" "usb_power_delivery"
w "$TC/port0/usb_power_delivery_revision" "3.0"
w "$TC/port0/orientation" "normal"

# PDO зарядника (source-capabilities партнёра): mV / mA.
SC="$TC/port0-partner/usb_power_delivery/source-capabilities"
w "$SC/1:fixed_supply/voltage" "5000";  w "$SC/1:fixed_supply/maximum_current" "3000"
w "$SC/2:fixed_supply/voltage" "9000";  w "$SC/2:fixed_supply/maximum_current" "3000"
w "$SC/3:fixed_supply/voltage" "15000"; w "$SC/3:fixed_supply/maximum_current" "3000"
w "$SC/4:fixed_supply/voltage" "20000"; w "$SC/4:fixed_supply/maximum_current" "5000"
w "$SC/5:programmable_supply/minimum_voltage" "3300"
w "$SC/5:programmable_supply/maximum_voltage" "21000"
w "$SC/5:programmable_supply/maximum_current" "5000"

# port1: idle sink, партнёра нет.
w "$TC/port1/power_role" "source [sink]"
w "$TC/port1/data_role" "host [device]"
w "$TC/port1/power_operation_mode" "default"
w "$TC/port1/usb_power_delivery_revision" "2.0"
w "$TC/port1/orientation" "unknown"

PSY="$ROOT/sys/class/power_supply"

# UCSI source PSY: коннектор 1 online, негоциировано 15V/3A = 45W.
w "$PSY/ucsi-source-psy-USBC000:001/type" "USB"
w "$PSY/ucsi-source-psy-USBC000:001/online" "1"
w "$PSY/ucsi-source-psy-USBC000:001/voltage_now" "15000000"
w "$PSY/ucsi-source-psy-USBC000:001/current_now" "3000000"
w "$PSY/ucsi-source-psy-USBC000:001/voltage_max" "20000000"
w "$PSY/ucsi-source-psy-USBC000:001/current_max" "5000000"
w "$PSY/ucsi-source-psy-USBC000:001/usb_type" "[C] PD PD_PPS"

w "$PSY/ucsi-source-psy-USBC000:002/type" "USB"
w "$PSY/ucsi-source-psy-USBC000:002/online" "0"
w "$PSY/ucsi-source-psy-USBC000:002/voltage_now" "0"
w "$PSY/ucsi-source-psy-USBC000:002/current_now" "0"
w "$PSY/ucsi-source-psy-USBC000:002/usb_type" "[C] PD PD_PPS"

# Батарея: заряжается.
w "$PSY/BAT1/type" "Battery"
w "$PSY/BAT1/status" "Charging"
w "$PSY/BAT1/capacity" "92"
w "$PSY/BAT1/voltage_now" "16800000"
w "$PSY/BAT1/current_now" "2500000"

# AC online.
w "$PSY/ACAD/type" "Mains"
w "$PSY/ACAD/online" "1"

echo "fixture ready: $ROOT"
