# Spike: testing cheat sheet

Throwaway validation spike for the Codex Companion data pipeline. Kept as evidence
of the data decisions, not as production code.

## Start a session

```powershell
cd spikes\manifest-probe
.\ask.cmd
```

Then type questions at the `d2>` prompt. `new` clears the conversation, `tech`
toggles exact numbers (prompt becomes `d2 [numbers]>`), `exit` quits.

## One-shot question

```powershell
cd spikes\manifest-probe
.\ask.cmd "what is the best DPS power weapon right now"
```

## Refresh the data

```powershell
cd spikes\manifest-probe
node sync.mjs
```

## Model settings

Edit `spikes\manifest-probe\.env`:

```
LLM_MODEL=gpt-5.4-mini                    # primary, stable
LLM_FALLBACK_MODEL=gemini-3.5-flash-lite  # cheaper, occasionally 502s upstream
```

If you see `upstream 502, retrying` and then an answer, retries worked. If you see
`model X unavailable, trying Y`, the fallback took over — also fine.

## Run raw SQL inside chat mode

```
sql select name, tier from aegis_weapons where tab='LFRs' order by case tier when 'S' then 0 when 'A' then 1 else 2 end
```

## The ten spike questions

```
what is the best DPS power weapon right now
what LFR should I use for a long boss damage phase
refurbished a499 stats and is it good
which rockets are S tier and where do they drop
best DPS for a short damage window vs a long one
what is the tier of edge transit and what perks should I look for
which hand cannons are top tier and what do they roll
what is the max DPS of a rapid fire LMG
i am new, which of these weapons can i get easily
what is the crit multiplier on precision LFRs
```

Known gaps at the time: builds, live vendor stock, Xur, weekly rotation, DLC prices,
patch notes. A refusal on those was the correct answer.
