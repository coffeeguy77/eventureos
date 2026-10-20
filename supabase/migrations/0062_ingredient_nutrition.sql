-- =====================================================================
-- 0062_ingredient_nutrition.sql
--
-- Nutrition and allergens for catering ingredients, so each menu item can show a nutrition information panel,
-- an ingredient list and its allergens:
--   nutrition        : per 100 g — { energy_kj, protein, fat, sat_fat, carbs, sugars, fibre, sodium_mg } (g unless noted)
--   nutrition_source : where the numbers came from (e.g. "AFCD Release 3: F003305 Croissant, plain" or "Supplier label")
--   grams_each       : weight of one unit, for ingredients counted in each / slice / piece (ml counts as 1 g)
--   allergens        : e.g. {gluten, wheat, milk, egg, soy, sesame, tree nuts, peanut, fish, crustacea, mollusc, lupin, sulphites}
-- Adds columns only; nothing is removed. Safe to run more than once.
-- =====================================================================

alter table public.catering_ingredients add column if not exists nutrition        jsonb;
alter table public.catering_ingredients add column if not exists nutrition_source text check (nutrition_source is null or char_length(nutrition_source) <= 200);
alter table public.catering_ingredients add column if not exists grams_each       numeric(10,2) check (grams_each is null or grams_each > 0);
alter table public.catering_ingredients add column if not exists allergens        text[] not null default '{}';
