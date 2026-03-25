1) bonus-wheel.png — готовый экспорт макета колеса (PNG/арт), не скриншот экрана.
2) fab-wheel-reference.png — опционально: кастомная иконка FAB (сейчас в коде используется /koleso.png).
3) fab-wheel-won.png — опционально: вариант после выигрыша (раньше вызывал 404, если файла не было).
Подгонка под PNG: BONUS_WHEEL_BOUNDARY_START_DEG и при необходимости BONUS_WHEEL_POINTER_BIAS_DEG в src/lib/wheel.ts
