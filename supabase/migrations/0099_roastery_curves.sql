-- 0099: Roastery — store each roast's curve (bean temp, air temp, burner, air setpoint over time) so roasts can be
-- viewed and compared as graphs. Compact JSON: {step, bt[], et[], burner[], burner_sp[], air_sp[]}, one sample
-- every `step` seconds from charge. has_curve lets lists show a graph link without loading the curve.

alter table public.roastery_roasts add column if not exists curve jsonb;
alter table public.roastery_roasts add column if not exists has_curve boolean generated always as (curve is not null) stored;
