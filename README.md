# 🏎️ GridGuessr

**GridGuessr** is a Farcaster Mini App.  
Each race week, you can predict what will happen on track — from pole position to fastest lap — and climb the leaderboard as the season unfolds.  

Built on **Base** and **Farcaster**, GridGuessr brings the thrill of race weekends onchain.

---

## 🎮 How it works

Before each Grand Prix:
- Make your predictions — pole, podium, fastest lap, first DNF, safety car, and more.  
- Picks lock when qualifying starts.  
- After the race, scores are updated automatically and leaderboards refresh.  

You can then share your results directly into Farcaster — show off your streaks, badges, and bragging rights 🏁  

---

## 🏆 Scoring

Each race offers **100 base points**, with an optional **+10 bonus** for the wildcard:

| Base Prediction          | Points |
|--------------------------|--------|
| Pole Position            | 15 pts |
| Race Winner              | 15 pts |
| 2nd Place                | 10 pts |
| 3rd Place                | 10 pts |
| Fastest Lap              | 10 pts |
| Fastest Pit Stop         | 10 pts |
| First DNF / No DNF       | 10 pts |
| Safety Car (Y/N)         | 10 pts |
| Winning Margin Bucket    | 10 pts |

| Bonus Prediction         | Points |
|--------------------------|--------|
| Wildcard (bonus)         | +10 pts |

Hit every base category, then nail the wildcard for a 110-point “Grand Prix Master” run.

---

## 🧰 Admin Runbook

### Fixing bad scores after a race
1. **Update the official result** – correct the row in `race_results` (e.g., fixing the wildcard answer or a podium slot).  
2. **Re-run the scorer** – call the admin results endpoint (via the UI or a script) with the corrected outcome. Scores, totals, and badges will be recomputed automatically.
3. **Double-check badges** – if any bonus badges slipped through incorrectly, delete them from `user_badges` and re-run the scorer for that race.
4. **Manual adjustments (last resort)** – when only a handful of players were affected, update their `predictions.score` and `users.total_points` directly to add or subtract the delta, then refresh the leaderboard.

Use the smoke script as a template if you need to automate one-off corrections. It shows how to seed data, invoke the scorer, and verify the outcome programmatically.

### Farcaster cast templates
- **Latest completed race**: Driver of the Day, Race Results Recap, Perfect Slate Alert, and Close Calls buttons all target the most recent race that has been scored.
- **Next prediction lock**: Lock reminder plus pole and winner consensus casts auto-fill for the upcoming race that is still open.
- **Global highlight**: Leaderboard Update pulls the current top three from the global standings.

The admin panel groups these buttons by target to keep things predictable; channel overrides apply to every template in the section.

---

## 🧠 Highlights

- Native Farcaster Mini App experience  
- QuickAuth sign-in with your Farcaster identity  
- Global and friends leaderboards  
- Simple admin flow for adding races and settling results  
- Built for community fun, not gambling  

---

## ⚠️ Disclaimer

GridGuessr is an independent fan project, built by the community for entertainment.  
It is **not affiliated with or endorsed by Formula One Management**.  
No real-money wagering or prizes.

---

**Make your picks. Beat your friends. Own race week.**  
🏁 [Base] · [Farcaster] · [GridGuessr]
