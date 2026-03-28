#!/bin/bash
# Routr Setup Script
# Adds short hostname entries to /etc/hosts so Chrome treats c/, gh/, etc. as URLs
# Must be run with sudo: sudo bash setup.sh

set -e

HOSTS_FILE="/etc/hosts"
MARKER="# Routr URL Shortcuts"

# Default short hostnames to register
HOSTNAMES="c m d gh yt r gpt cl docs sheets slides li maps n"

# Check if already set up
if grep -q "$MARKER" "$HOSTS_FILE" 2>/dev/null; then
  echo "Routr entries already exist in $HOSTS_FILE"
  echo "To update, first remove existing entries with: sudo bash setup.sh --remove"
  exit 0
fi

if [ "$1" = "--remove" ]; then
  # Remove Routr entries
  if grep -q "$MARKER" "$HOSTS_FILE" 2>/dev/null; then
    sed -i "/$MARKER/,/# End Routr/d" "$HOSTS_FILE"
    echo "Routr entries removed from $HOSTS_FILE"
  else
    echo "No Routr entries found in $HOSTS_FILE"
  fi
  exit 0
fi

# Check for root
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root. Use: sudo bash setup.sh"
  exit 1
fi

echo "Adding Routr shortcut hostnames to $HOSTS_FILE..."
echo "" >> "$HOSTS_FILE"
echo "$MARKER" >> "$HOSTS_FILE"

for host in $HOSTNAMES; do
  echo "127.0.0.1 $host" >> "$HOSTS_FILE"
  echo "  Added: $host -> 127.0.0.1"
done

echo "# End Routr" >> "$HOSTS_FILE"

echo ""
echo "Done! Added ${#HOSTNAMES[@]} hostname entries."
echo ""
echo "Next steps:"
echo "  1. Open chrome://extensions in Chrome"
echo "  2. Enable 'Developer mode' (top right)"
echo "  3. Click 'Load unpacked' and select this folder"
echo "  4. Type c/ in your address bar to test -> should go to Google Calendar"
echo ""
echo "To add more shortcuts later:"
echo "  1. Add the hostname to /etc/hosts (e.g., '127.0.0.1 tw')"
echo "  2. Add the shortcut in the extension's config page"
echo ""
echo "To remove all entries: sudo bash setup.sh --remove"
