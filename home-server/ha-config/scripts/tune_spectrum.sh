#!/bin/bash
# Tune Spectrum TV to a channel by search name
# Usage: tune_spectrum.sh <search_term>
# Example: tune_spectrum.sh CNN

TV_IP="192.168.0.141"
TV_PORT="5555"
ADB="adb -s $TV_IP:$TV_PORT"
SEARCH_TERM="${1:-CNN}"

# Ensure ADB connection
adb connect "$TV_IP:$TV_PORT" 2>/dev/null
sleep 1

# Verify connection
if ! adb devices | grep -q "$TV_IP:$TV_PORT.*device"; then
    echo "ERROR: Could not connect to TV"
    exit 1
fi

# Step 1: Wake TV
echo "Waking TV..."
$ADB shell input keyevent KEYCODE_WAKEUP
sleep 3

# Step 2: Launch Spectrum TV app
echo "Launching Spectrum TV..."
$ADB shell am start -n com.spectrum.stva.androidtv/.ui.HostedMainActivity
sleep 5

# Step 3: Navigate to search
echo "Opening search..."
# Go up to nav bar
for i in 1 2 3; do
    $ADB shell input keyevent KEYCODE_DPAD_UP
    sleep 0.3
done
# Go far left to HOME first
for i in 1 2 3 4 5 6 7; do
    $ADB shell input keyevent KEYCODE_DPAD_LEFT
    sleep 0.2
done
# Go right to search icon (past HOME, LIVE TV, GUIDE, MY LIBRARY, ON DEMAND, search)
for i in 1 2 3 4 5 6; do
    $ADB shell input keyevent KEYCODE_DPAD_RIGHT
    sleep 0.2
done
$ADB shell input keyevent KEYCODE_DPAD_CENTER
sleep 2

# Step 4: Type search term using d-pad keyboard
# Keyboard starts focused on A (pos 0). Letters A-Z = positions 0-25
echo "Typing: $SEARCH_TERM"
current_pos=0
for (( i=0; i<${#SEARCH_TERM}; i++ )); do
    char="${SEARCH_TERM:$i:1}"
    target_pos=$(( $(printf '%d' "'$char") - 65 ))
    diff=$(( target_pos - current_pos ))

    if [ $diff -gt 0 ]; then
        for (( j=0; j<diff; j++ )); do
            $ADB shell input keyevent KEYCODE_DPAD_RIGHT
            sleep 0.3
        done
    elif [ $diff -lt 0 ]; then
        abs_diff=$(( -diff ))
        for (( j=0; j<abs_diff; j++ )); do
            $ADB shell input keyevent KEYCODE_DPAD_LEFT
            sleep 0.3
        done
    fi

    $ADB shell input keyevent KEYCODE_DPAD_CENTER
    sleep 0.8
    current_pos=$target_pos
done

# Step 5: Select first result
echo "Selecting first result..."
sleep 2
$ADB shell input keyevent KEYCODE_DPAD_DOWN
sleep 0.5
$ADB shell input keyevent KEYCODE_DPAD_DOWN
sleep 0.5
$ADB shell input keyevent KEYCODE_DPAD_CENTER

echo "Done! Tuned to $SEARCH_TERM"
