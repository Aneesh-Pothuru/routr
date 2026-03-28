# Set up and test the Routr Chrome extension on my local machine.

## Step 1: Pull the code

Clone the repo and check out the feature branch:

    cd ~/Documents/Code
    git clone https://github.com/Aneesh-Pothuru/routr.git
    cd routr
    git checkout claude/chrome-url-shortcuts-hgxMO

If the repo already exists at ~/Documents/Code/routr, just pull the latest:

    cd ~/Documents/Code/routr
    git fetch origin claude/chrome-url-shortcuts-hgxMO
    git checkout claude/chrome-url-shortcuts-hgxMO
    git pull origin claude/chrome-url-shortcuts-hgxMO

## Step 2: Set up /etc/hosts

Run the setup script to add all shortcut hostnames:

    sudo bash ~/Documents/Code/routr/setup.sh

If it says entries already exist, remove and re-add:

    sudo bash ~/Documents/Code/routr/setup.sh --remove
    sudo bash ~/Documents/Code/routr/setup.sh

Verify by checking that /etc/hosts contains lines like "127.0.0.1 c", "127.0.0.1 ow", etc.

## Step 3: Install the Chrome extension

1. Open Chrome and navigate to chrome://extensions
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the folder: ~/Documents/Code/routr
5. Verify the extension appears as "Routr - URL Shortcuts" with the blue "R" icon

## Step 4: Test the shortcuts

Test these in Chrome's address bar (type the shortcut and press Enter):

- c/ should redirect to https://calendar.google.com
- m/ should redirect to https://mail.google.com
- ow/ should redirect to https://outlook.office.com/mail/
- gh/ should redirect to https://github.com
- cl/ should redirect to https://claude.ai

## Step 5: Test the popup

- Click the Routr extension icon in Chrome's toolbar
- Verify the popup shows a searchable list of all 34 shortcuts
- Type "finance" or "calendar" in the popup search and verify filtering works
- Click a shortcut in the popup and verify it navigates

## Step 6: Test the options/config page

- Right-click the Routr extension icon then click "Options" (or click "Settings" in the popup)
- Verify all 34 shortcuts are listed
- Test adding a new shortcut: key=test, URL=https://example.com, description=Test Shortcut
- Test editing an existing shortcut (click Edit, change the URL, click Save)
- Test deleting the test shortcut
- Test the search/filter bar
- Test export (should download a JSON file)
- Test import (re-import the exported file)

## Step 7: Report results

Tell me:

1. Did the /etc/hosts setup succeed?
2. Did the extension load in Chrome without errors?
3. Which shortcuts worked and which didn't?
4. Did the popup and options page function correctly?
5. Any errors in the Chrome extension console? (Check via chrome://extensions then Routr then "Inspect views: service worker")

Note: Steps 3-6 require GUI interaction with Chrome. If you can't directly control the browser, walk me through the steps and I'll do them manually while you handle the terminal/file setup parts (Steps 1-2).
