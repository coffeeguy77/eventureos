-- Bean Culture coffee shop: products (from beanculture.com.au, with their WooCommerce ids so a later WooCommerce import updates
-- rather than duplicates) and shop settings (shipping and subscription options as set up in WooCommerce).
-- Run AFTER supabase/migrations/0055_shop.sql. Safe to run more than once.
do $$
declare
  o uuid := '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';
  g text[] := array['Whole beans','Espresso','Stovetop','Filter machine','Plunger'];
  pid uuid;
  recipe text := E'Espresso recipe\nDose: 20g\nBrew time: 28–32 seconds\nYield: 40g ± 2g\nTemp: 94°C\n\nThis recipe is a good place to start, but we recommend fine-tuning it to suit your taste and machinery.';
begin
  -- Parliament | Café Blend
  insert into public.shop_products (organisation_id, woo_id, slug, name, kind, category, short, description, tasting_notes, origin, best_for, image_url, images, grinds, subscribable, featured, status, position)
  values (o, 5486, 'parliament-cafe-blend', 'Parliament | Café Blend', 'coffee', 'Espresso Coffee',
    'Bean Culture''s signature blend. A traditional milk-focused coffee, full bodied with bold flavours of caramel, nuts and chocolate.',
    recipe, 'Caramel, chocolate & nuts', 'Papua New Guinea, Colombia & Brazil', 'Milk-based espresso',
    'https://www.beanculture.com.au/wp-content/uploads/2024/12/par.png', array['https://www.beanculture.com.au/wp-content/uploads/2024/12/par.png'], g, true, true, 'active', 1)
  on conflict (organisation_id, slug) do nothing;
  select id into pid from public.shop_products where organisation_id = o and woo_id = 5486;
  if not exists (select 1 from public.shop_variants where product_id = pid) then
    insert into public.shop_variants (organisation_id, product_id, label, grams, price, position, woo_ids) values
      (o, pid, '200g', 200, 18, 0, array[5487,5488,5489,5490,5491]), (o, pid, '500g', 500, 38, 1, array[5492,5493,5494,5495,5496]), (o, pid, '1kg', 1000, 68, 2, array[5497,5498,5499,5500,5501]);
  end if;

  -- Seasonal Espresso Blend
  insert into public.shop_products (organisation_id, woo_id, slug, name, kind, category, short, description, tasting_notes, origin, image_url, images, grinds, subscribable, featured, status, position)
  values (o, 5375, 'seasonal-espresso-blend', 'Seasonal Espresso Blend', 'coffee', 'Espresso Coffee',
    'Gold award 2023. A blend of three beans: Ethiopian Guji, Ethiopian Yirgacheffe and Colombian.',
    recipe, 'Black tea, caramel candy, light florals, citrus fruits & spice', 'Ethiopia (Guji & Yirgacheffe) & Colombia',
    'https://www.beanculture.com.au/wp-content/uploads/2024/12/season-1.png', array['https://www.beanculture.com.au/wp-content/uploads/2024/12/season-1.png'], g, true, false, 'active', 2)
  on conflict (organisation_id, slug) do nothing;
  select id into pid from public.shop_products where organisation_id = o and woo_id = 5375;
  if not exists (select 1 from public.shop_variants where product_id = pid) then
    insert into public.shop_variants (organisation_id, product_id, label, grams, price, position, woo_ids) values
      (o, pid, '200g', 200, 20, 0, array[5376,5377,5378,5379,5380]), (o, pid, '500g', 500, 40, 1, array[5381,5382,5383,5384,5385]), (o, pid, '1kg', 1000, 75, 2, array[5386,5387,5388,5389,5390]);
  end if;

  -- Colombia Popayan Reserve Grade
  insert into public.shop_products (organisation_id, woo_id, slug, name, kind, category, origin, image_url, images, grinds, subscribable, status, position)
  values (o, 5467, 'colombia-popayan-reserve-grade', 'Colombia Popayan Reserve Grade', 'coffee', 'Espresso Coffee', 'Popayán, Colombia',
    'https://www.beanculture.com.au/wp-content/uploads/2024/12/colo.png', array['https://www.beanculture.com.au/wp-content/uploads/2024/12/colo.png'], g, true, 'active', 3)
  on conflict (organisation_id, slug) do nothing;
  select id into pid from public.shop_products where organisation_id = o and woo_id = 5467;
  if not exists (select 1 from public.shop_variants where product_id = pid) then
    insert into public.shop_variants (organisation_id, product_id, label, grams, price, position, woo_ids) values
      (o, pid, '200g', 200, 18, 0, array[5468,5469,5470,5471,5472]), (o, pid, '500g', 500, 38, 1, array[5473,5474,5475,5476,5477]), (o, pid, '1kg', 1000, 70, 2, array[5478,5479,5480,5481,5482]);
  end if;

  -- Night Owl Decaf
  insert into public.shop_products (organisation_id, woo_id, slug, name, kind, category, short, description, origin, best_for, image_url, images, grinds, subscribable, status, position)
  values (o, 5333, 'night-owl-decaf', 'Night Owl Decaf', 'coffee', 'Espresso Coffee',
    'Sugar cane decaf from small farm holders in Cauca, Colombia. You won''t know you''re drinking a decaf!',
    E'These coffee cherries were picked by small farm holders spread across the land of Cauca, Colombia. After harvest, selected coffees are sorted to remove any unripe or hollow cherries. They are then transported to DESCAFECOL, where they are milled and put through a sugar cane decaffeination process.\n\nA by-product of sugar cane fermentation is used as a caffeine solvent in this process. Green beans are steamed after harvest to open up their pores, soaked twice in this solution for up to 8 hours, then steamed again, polished and dried to be exported. This process sustains the fruity qualities of the coffee, allowing a better balance between caramel and fruit.\n\n' || recipe,
    'Cauca, Colombia', 'Espresso and milk-based',
    'https://www.beanculture.com.au/wp-content/uploads/2024/12/owl-1.png', array['https://www.beanculture.com.au/wp-content/uploads/2024/12/owl-1.png'], g, true, 'active', 4)
  on conflict (organisation_id, slug) do nothing;
  select id into pid from public.shop_products where organisation_id = o and woo_id = 5333;
  if not exists (select 1 from public.shop_variants where product_id = pid) then
    insert into public.shop_variants (organisation_id, product_id, label, grams, price, position, woo_ids) values
      (o, pid, '200g', 200, 20, 0, array[5334,5335,5336,5337,5338]), (o, pid, '500g', 500, 40, 1, array[5339,5340,5341,5342,5343]), (o, pid, '1kg', 1000, 75, 2, array[5344,5345,5346,5347,5348]);
  end if;

  -- Roaster Selection Box
  insert into public.shop_products (organisation_id, woo_id, slug, name, kind, category, short, image_url, images, grinds, subscribable, status, position)
  values (o, 5421, 'roaster-selection-box', 'Roaster Selection Box', 'coffee', 'Gift box',
    '4 × 200g bags of our favourite coffees of the year. Treat yourself, or give one to friends and family.',
    'https://www.beanculture.com.au/wp-content/uploads/2024/12/christmas.png', array['https://www.beanculture.com.au/wp-content/uploads/2024/12/christmas.png'], g, false, 'active', 5)
  on conflict (organisation_id, slug) do nothing;
  select id into pid from public.shop_products where organisation_id = o and woo_id = 5421;
  if not exists (select 1 from public.shop_variants where product_id = pid) then
    insert into public.shop_variants (organisation_id, product_id, label, grams, price, position, woo_ids) values (o, pid, '4 × 200g', 800, 65, 0, array[5422,5423,5424,5425,5426]);
  end if;

  -- Shop settings (only if not set yet)
  update public.organisations set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('shop', jsonb_build_object(
    'enabled', true,
    'title', 'Freshly roasted coffee',
    'tagline', 'Roasted fresh every week and sent to your door — or set up a subscription and never run out.',
    'roastNote', 'We typically roast fresh on Wednesday + Thursday and ship out on Thursday / Friday via Australia Post.',
    'roastDays', jsonb_build_array(3, 4), 'dispatchDays', jsonb_build_array(4, 5), 'carrier', 'Australia Post', 'leadDays', 1,
    'flatRate', 10, 'freeOver', 80, 'pickup', false,
    'subDiscount', 15,
    'prepaid', jsonb_build_array(jsonb_build_object('months', 3, 'discount', 0), jsonb_build_object('months', 6, 'discount', 0), jsonb_build_object('months', 12, 'discount', 0)),
    'frequencies', jsonb_build_array(jsonb_build_object('unit','week','count',1), jsonb_build_object('unit','week','count',2), jsonb_build_object('unit','week','count',3), jsonb_build_object('unit','week','count',4), jsonb_build_object('unit','week','count',5), jsonb_build_object('unit','week','count',6), jsonb_build_object('unit','month','count',2)),
    'giftAmounts', jsonb_build_array(25, 50, 75, 100, 125, 150, 200), 'giftExpiryMonths', 36,
    'giftCardArt', 'https://www.eventureos.com.au/media/beanculture/giftcard-blank.jpg', 'giftTagline', 'Good coffee creates brighter days.',
    'grinder', 'EK grinder', 'eventAddon', true))
  where id = o and not (coalesce(settings, '{}'::jsonb) ? 'shop');
end $$;
