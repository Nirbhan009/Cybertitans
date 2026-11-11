<<<<<<< HEAD
# CRACK THE VAULT: staff guide

## Start it
**With phones (normal setup):** double-click `START.bat`. It needs Node.js, and it opens the game in your browser. Keep the black window open all night. If Windows asks about the firewall, click Allow for private networks.

**Booth only, no phones:** double-click `index.html` and open it in Chrome.

Press F11 for full screen.

## Getting phones connected
Phones must be on the same network as the laptop. School WiFi often blocks this, so test it first. The reliable option is turning on the laptop's Mobile Hotspot (Windows Settings, Network) and having players join it, then restarting `START.bat` so the QR code picks up the hotspot address.

The QR code and address are on the attract screen.

## Projector leaderboard
Open a new window in the same browser (Ctrl+N), go to the same address as the game, add `#board` to the end, drag it to the projector and press F11.

## Phones at the booth
1. A player scans the QR code, picks a nickname and gets a 4-character code.
2. They show you the code and pay.
3. Tap **Paid** next to their code (or **3 for $5**). Their game starts on their phone.

Staff can do this from any phone: go to the same address but end it with `/staff`, then enter the PIN. That way the booth laptop is never interrupted. The same list is in the laptop's staff panel.

The list also has **Hint**, **Void** (refunds that sale) and **Prize given**.

## Phone modes
The phone home screen offers three games plus a free taster:

- **Crack the Vault:** the main game, Easy then Hard.
- **Scam Spotter (for parents):** 10 real-looking texts, emails, calls and pop-ups in 90 seconds. Tap SCAM or LEGIT. After each answer the red flags light up with a one-line explanation. It has its own leaderboard. Price and timer are in settings, and a price of 0 makes it free with no payment step.
- **Duel:** one player opens a duel and shows a QR code. The other scans it, and you see one row: "Mom vs Maya, Paid $4 (both)". Both tap Ready, a synced 3-2-1 countdown starts, they get identical puzzles, and the first to open the vault wins. The projector shows the race live.
- **Free demo:** one lock in 30 seconds, no payment, to hook people in line.

After every round, players can save a **Hacker Card** image to share. They also see a "Want to do this for real?" box. Paste your team's sign-up link into Money and settings, under "Join-the-team link", and it becomes a QR code on every result screen, phone and laptop.

**Parent station:** put a tablet on a stand, open the phone address with `?station` on the end, and it gets a NEXT PLAYER button so each parent starts fresh.

## Who goes on the leaderboard
Everyone who plays a paid round goes on the board, even if they don't crack the vault. Players who cracked it rank first, fastest first. Below them come everyone who didn't, ranked by locks broken (shown as "3/4 locks") and then by speed. Free test rounds and rounds where staff used Reveal Code stay off.

## Projector extras (with START.bat)
Three leaderboards (Hard, Easy, Scam Spotter), a live duel panel with each player's locks lighting up, and a scrolling ticker of what's happening ("Riley cracked the Server Log", "Jo tripped the firewall").

## The booth laptop
| To do this | Do this |
|---|---|
| Open the staff panel | Ctrl+Shift+A, or triple-click the "SATEC x CyberPatriot" text |
| Close the staff panel | Esc |
| Sell one attempt | Start Round |
| Sell a 3-pack | Start 3-Pack |
| Sell Hard Mode | Pick the player in the Sell Hard Mode list |
| Sell a hint | Unlock Hint (it appears on the puzzle the player has open) |
| Fix a glitch | Reset Round, then Free replay (money unchanged) |
| Undo a mis-click or refund | Reset Round, then Void sale |
| Practice without counting money | Free Test: Easy or Free Test: Hard |
| Finish a win screen | Click "Staff: continue" once the prize is handed over |

The default PIN is **2580**. Change it before the event, because the `/staff` page is reachable from any phone on the network.

## Two tiers
Everyone plays **Easy** first. Finishing Easy unlocks **Hard**: $2 if they cracked Easy in under 2:00, otherwise $4. Prices, the 2:00 limit, and Hard's timer and tries are in Money and settings. Hard has its own leaderboard.

## How Hard differs
Default clock 2:30, 2 tries at the code. A wrong answer locks the console for 20 seconds, then 30, then 40. Hints only nudge and never give the answer.

| Puzzle | Easy | Hard |
|---|---|---|
| Radio Intercept | Find shift 3 | Unknown shift, and the message is backwards |
| Packet Capture | Pick Base64 | Three layers of encoding to peel off in the right order |
| File Server | Find the dot file | Five hidden keys, one real, identified using two memos |
| Suspicious Email | Spot the fake link | Four fakes, click the only real link |
| Sensor Readout | Add up 6 labelled bits | Convert 10 unlabelled bits in your head |
| Server Log | Click the attacker | Status codes only, with decoys who look guilty |
| Password Audit | Pick strongest or weakest | Rank all four |

## Before doors open
1. Play a Free Test on both tiers, and join from a real phone.
2. In Money and settings, use Reset Sales and Reset Leaderboard to clear testing.
3. Check the projector window updates.

## During and after
Press Export CSV every so often as a backup, and at the end of the night. The file lands in Downloads.

With `START.bat`, data is saved in `data.json` in this folder and survives restarts. Copying that file is a full backup. It also contains the laptop's private key, so don't share it.

## Forgot the PIN?
Stop the server, open `data.json` in Notepad, delete the `"pinHash":"..."` entry (including its comma), save, and start again. The PIN goes back to 2580.

For booth-only mode: open Chrome's menu, More Tools, Developer Tools, Console, and run `localStorage.removeItem('ctv.settings')`.
=======
# Cybertitans
It is a cyberpat game
>>>>>>> 15b78f7ec01994fbdb34729b3b37344b810b8a7e
