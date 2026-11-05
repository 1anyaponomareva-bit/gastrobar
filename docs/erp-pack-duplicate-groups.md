# Дубли фасовок (не объединять)

Снимок справочника `erp_packs` по ключу **name + unit + qty_base**. Строки **не сливаются**: одинаковое имя — разные id.

Источник: прод REST `/api/erp/state?parts=packs,productPacks,products` (сессия владельца), 2026-11-05. Активных групп-дублей: **16**.

## 1. box 1000 pcs · pcs · 1000

Повторов: 3.

- id `2977ab87-31a3-471e-9ab8-43ed22486b96`: Hotdog Box / Hộp hotdog `hotdog-box`
- id `6fcf04df-de57-4579-873f-2f1ad217bce6`: Plastic Cup 95 (500ml) / Ly nhựa 95 (500ml) `plastic-cup-95-500ml`
- id `cb9bb988-f0a6-4370-8cfc-fdc4ae27201d`: Plastic Lid 95 / Nắp ly nhựa 95 `plastic-lid-95`

## 2. box 15 kg · kg · 15

Повторов: 2.

- id `c9188114-2e43-4623-8854-eac6d3dd7750`: Chicken - Leg Quater / Gà - Đùi góc tư `chicken-leg-quater`
- id `2701db97-42ce-4b74-b0b9-b59e4afe97c0`: Pork - Fat / Heo - Mỡ `pork-fat`

## 3. box 20 kg · kg · 20

Повторов: 3.

- id `364e5896-9d7c-42c2-b138-33ca29e9398e`: Buffalo Meat - Striploin 46 / Thịt trâu - Thăn ngoại 46 `buffalo-meat-striploin-46`
- id `cb21b77d-65d4-4da5-b067-7be78b6696bf`: Basa Fillet / Phi lê cá basa `basa-fillet`
- id `e87cddb1-21cd-4972-b546-9503e7b8fc4d`: Chicken - Wings / Gà - Cánh `chicken-wings`

## 4. box 25 kg · kg · 25

Повторов: 5.

- id `fe935d6d-a2c8-4a18-a8b8-6edc68e11802`: Plastic Bag (Cup 25*35) / Túi nilon đựng ly (25*35) `plastic-bag-cup-25-35`
- id `28f62640-ba8d-456d-ac2b-e7130f7b73c1`: Plastic Bag (3kg) / Túi nilon (3kg) `plastic-bag-3kg`
- id `53e22257-4b6e-4081-8308-10a124ec11d1`: Plastic Bag (5kg) / Túi nilon (5kg) `plastic-bag-5kg`
- id `64dc53bc-4fe8-4656-875e-15d27aa9dcb3`: Garbage Bags (45L 64*78) / Túi rác (45L 64*78) `garbage-bags-45l-64-78`
- id `fcc6daf1-8326-419d-96f6-13ed7b042254`: Garbage Bags (60L 78*92) / Túi rác (60L 78*92) `garbage-bags-60l-78-92`

## 5. box 5*2 kg · kg · 10

Повторов: 2.

- id `a5254646-3986-4305-8303-0c8c285d8340`: Mozzarella Cheese / Phô mai Mozzarella `cheese-mozzarella-golden-pizza`
- id `bb4ff5ed-4330-4d57-b753-63eb9e3e41c0`: Mozzarella Cheese / Phô mai Mozzarella `cheese-mozzarella-mlekpol`

## 6. btl 5 L · l · 5

Повторов: 3.

- id `39b865d0-6a8b-4833-b30c-d5f203249a9e`: Oil Cooking / Dầu ăn `oil-cooking-happy-price`
- id `4ba4f3f9-7cee-400d-b0ab-4b46ed2965af`: Sanitizer 90% / Cồn sát khuẩn 90% `sanitizer-90`
- id `87f9f623-58f0-4de5-b270-b1063ffd4221`: Steel Cleaning Liquid / Nước lau inox `steel-cleaning-liquid-dr-c`

## 7. btl 500 g · kg · 0.5

Повторов: 2.

- id `6eeab281-c3e0-48a3-b95a-5e01af4ca497`: Mustard - Yellow / Mù tạt - Vàng `mustard-yellow-golden-farm`
- id `1036a2bc-f1aa-4a14-851f-eff00efe628a`: Sauce - BBQ / Sốt - BBQ `sauce-bbq-mccormick-tanguy`

## 8. kg 1 kg · kg · 1

Повторов: 18.

- id `664c47b9-dacf-4174-b175-ef6fc912cd85`: Foil Sheet (30x17) / Giấy bạc tờ (30x17) `foil-sheet-30x17`
- id `574083a2-0f4d-4803-bc57-2de3d40051c5`: Straw (8*21) / Ống hút (8*21) `straw-8-21`
- id `c83d8932-e116-4d82-bf3f-92d1a8586796`: Baby Cucumber / Dưa leo baby `baby-cucumber`
- id `7ffa1bdc-fe40-4431-a6b0-7b64aa9b2eba`: Garlic / Tỏi `garlic`
- id `82474c88-c37f-4356-8199-38ba10736b8a`: Lemon / Chanh vàng `lemon`
- id `30b3c331-37d4-4392-bf1d-97e56e48de40`: Salad / Xà lách `salad`
- id `62d101a6-130b-47bb-8975-30bda314b682`: Lime / Chanh xanh `lime`
- id `bfe2706d-ebc0-4f25-b8f9-51f32b2fc4fa`: Onion / Hành tây `onion`
- id `f67a823b-dc45-4f25-a1bc-4bcf64f9dfcc`: Onion Red / Hành tây tím `onion-red`
- id `66241ebf-2056-4b37-822e-83aa2594d3f2`: Green Bell Pepper / Ớt chuông xanh `green-bell-pepper`
- id `f071850a-307a-4b5a-abd5-e9180ab2f352`: Red Bell Pepper / Ớt chuông đỏ `red-bell-pepper`
- id `95575f28-8ee9-4366-8868-b926e82c726b`: Beef Tomatos / Cà chua beef `beef-tomatos`
- id `8beebaa8-2c7b-4eff-84d3-8bd4188601c4`: Baby Potato / Khoai tây bi `baby-potato`
- id `ab889977-246a-4c4f-be68-a08d6c41dfbc`: Parsley / Ngò tây `parsley`
- id `cc3179dd-1ccb-49a8-b154-a06c8c6da6e1`: Sugar / Đường `sugar-bien-hoa-re`
- id `ede585b5-13ef-4744-8b6d-aed644924840`: Vacuum Bag (15*20) / Túi hút chân không (15*20) `vacuum-bag-15-20`
- id `5dd49100-e132-49c6-9f60-687383bdf5d8`: Vacuum Bag (18*25) / Túi hút chân không (18*25) `vacuum-bag-18-25`
- id `538d71cc-c98c-4bb9-a748-bca9f59228bc`: Vacuum Bag (20*30) / Túi hút chân không (20*30) `vacuum-bag-20-30`

## 9. pack 10 pcs · pcs · 10

Повторов: 2.

- id `c10b025a-4361-41ac-ae9c-62c02120b42e`: Eggs / Trứng gà `eggs-mm-pro`
- id `9f583d9b-caa8-45e2-91d5-29267134ba21`: Hand Towel / Khăn lau tay `hand-towel-khan-tay`

## 10. pack 100 pcs · pcs · 100

Повторов: 4.

- id `b9a857e5-70b4-467a-9d83-25d15a4b2cb1`: Plastic Gloves (Single Pack) / Găng tay nilon (gói lẻ) `plastic-gloves-single-pack`
- id `a7383f05-00f1-4686-bcd7-c1bdae1b32a6`: Plastic Fork and Spoon (Single Pack) / Nĩa và muỗng nhựa (gói lẻ) `plastic-fork-and-spoon-single-pack`
- id `8acf9f9e-7570-4232-b7e1-1f0d8ebb7f7e`: Gloves - Vinyl (Large) / Găng tay - Vinyl (size L) `gloves-vinyl-large`
- id `99a54075-b834-478d-be82-d60f937e0f2b`: Patty Paper (11.4cm) / Giấy lót patty (11.4cm) `patty-paper-11-4cm`

## 11. pack 24 pcs · pcs · 24

Повторов: 8.

- id `993220e5-147a-4d0d-b137-0b285c0f1c03`: Saigon Beer (330ml) / Bia Sài Gòn (330ml) `saigon-beer-330ml`
- id `3a8465dc-0ff4-41c7-96fe-9d880343a7de`: Coca-Cola (Can 320ml) / Coca-Cola (lon 320ml) `coca-cola-can-320ml`
- id `028feb73-adda-4d40-bf80-2bea38e9d5bf`: Coca-Cola Zero (Can 320ml) / Coca-Cola Zero (lon 320ml) `coca-cola-zero-can-320ml`
- id `f2b1e936-dea5-49e2-b5cc-6cd74f2a9412`: Fanta (Can 320ml) / Fanta (lon 320ml) `fanta-can-320ml`
- id `40a7fa63-0214-42d3-b7d6-fe8f93e19b9e`: Schweppes Ginger Ale (Can 320ml) / Schweppes Ginger Ale (lon 320ml) `schweppes-ginger-ale-can-320ml`
- id `71e19e56-d6f4-49a6-83a8-a7c09f61b0ee`: Schweppes Soda (Can 320ml) / Schweppes Soda (lon 320ml) `schweppes-soda-can-320ml`
- id `57bb82eb-8376-4efa-8333-861a6510ee66`: Schweppes Tonic (Can 320ml) / Schweppes Tonic (lon 320ml) `schweppes-tonic-can-320ml`
- id `bdaf89cc-6378-42b1-8525-68dbd9d6f00e`: Sprite (Can 320ml) / Sprite (lon 320ml) `sprite-can-320ml`

## 12. pack 50 pcs · pcs · 50

Повторов: 2.

- id `d41288e8-06f9-4a4f-a16c-db0f9364874d`: Paper Wrap / Giấy gói `paper-wrap`
- id `0c470431-5fdc-4186-aafa-1a67540d1cc3`: Bamboo Skewers (20cm) / Que xiên tre (20cm) `bamboo-skewers-20cm`

## 13. pack 6 pcs · pcs · 6

Повторов: 2.

- id `91e11b18-b0ea-426b-858c-0835621665a4`: Kitchen Towel / Khăn giấy nhà bếp `kitchen-towel-mm-pro`
- id `3a4ce365-b780-421d-a4d2-0027bf0768a7`: Steel Scrub / Cước chà inox `steel-scrub-mm-pro`

## 14. pcs 1 kg · kg · 1

Повторов: 7.

- id `ac2ef7b1-dafc-4a8b-80b9-ba8382837367`: Yogurt / Sữa chua `yogurt-plain-dalat`
- id `f0e3aabd-b703-42fb-85ac-43cd4be14b1c`: Corn Starch / Bột bắp `corn-starch-meizan`
- id `a60f16c8-3df0-4d9d-98d1-4b2e37d274ae`: Flour / Bột mì `flour-meizan`
- id `01c278d5-bb4c-471d-897c-1a131a265705`: Panko Bread Crumbs / Bột chiên xù Panko `panko-bread-crumbs-panko`
- id `9caeb60b-a111-4ac0-bc95-0eb3f3dfe5c9`: Salt / Muối `salt-vietsalt`
- id `9fb88082-bc9a-4145-aa22-edb39b7279b2`: Salt Nitrite / Muối nitrit `salt-nitrite`
- id `97cb2690-a743-4db1-93b6-c74d9e74e5ba`: Mayonaise / Sốt mayonnaise `mayonaise-mm-pro`

## 15. pcs 1 pcs · pcs · 1

Повторов: 4.

- id `b18d3a73-3307-4fb3-a4b1-a9ba384922c2`: Aluminum Foil (45x285m) / Giấy bạc cuộn (45x285m) `aluminum-foil-45x285m-mm-pro`
- id `8eb9fefa-5410-4f4a-80bd-17a360e82804`: Cling Film (30x300m) / Màng bọc thực phẩm (30x300m) `cling-film-30x300m-happy-price`
- id `fda6f3d0-ea56-4910-abc9-694fa4fa90f1`: Cling Film (45x600m) / Màng bọc thực phẩm (45x600m) `cling-film-45x600m-happy-price`
- id `6950754f-1acd-4eab-9768-cdefeaf33042`: Stickers (35x22x50m) / Nhãn dán (35x22x50m) `stickers-35x22x50m`

## 16. pcs 500 g · kg · 0.5

Повторов: 12.

- id `590c88c1-9c8a-4809-937b-1ca7b56a0f55`: Cilantro (Dry) / Ngò rí (khô) `cilantro-dry`
- id `7b30ea86-a380-4c5d-8b2f-79273dc494a6`: Coriander (Powder) / Hạt ngò (bột) `coriander-powder`
- id `8151ca1d-0dcd-4bb0-ab94-4b7b5fe008ea`: Cumin (Powder) / Thì là Ai Cập (bột) `cumin-powder`
- id `2089e240-8bca-4652-b0a9-8af52270f99e`: Garlic (Powder) / Tỏi (bột) `garlic-powder`
- id `607ba125-bb0b-44c2-b406-1d54f6546d64`: Ginger (Powder) / Gừng (bột) `ginger-powder`
- id `f347f194-b0b9-4e27-a3ff-545c43ac8ffc`: Onion (Powder) / Hành tây (bột) `onion-powder`
- id `9274ff95-1ba0-4123-8034-7123154cf535`: Paprika (Powder) / Ớt paprika (bột) `paprika-powder`
- id `b6d6a5b2-4a14-40dc-a37e-0306a0b09468`: Paprika Smoked (Powder) / Ớt paprika xông khói (bột) `paprika-smoked-powder`
- id `79d7a66b-df3e-4cc8-aa1d-ae38d16a5637`: Paprika Sweet (Powder) / Ớt paprika ngọt (bột) `paprika-sweet-powder`
- id `0437edb9-53bc-4029-84e1-41c450362731`: Parsley (Dry) / Ngò tây (khô) `parsley-dry`
- id `1db920d1-07a7-44a9-99cc-d6266b804717`: Pepper White (Powder) / Tiêu trắng (bột) `pepper-white-powder`
- id `42fbe9dc-a83d-481d-98cb-8d4b8347e56a`: Yeast / Men nở `yeast`
