import type { StaffTestQuestion } from "@/data/staffTestTypes";

export const STAFF_TEST_PRACTICE_PASSING_SCORE = 22;

export const STAFF_TEST_PRACTICE_QUESTIONS: StaffTestQuestion[] = [
  {
    id: "q01",
    number: 1,
    promptRu: "Что является главным правилом при приготовлении блюд?",
    promptVn: "Quy tắc quan trọng nhất khi chế biến món ăn là gì?",
    options: [
      { key: "A", textRu: "Готовить по памяти", textVn: "Làm theo trí nhớ" },
      {
        key: "B",
        textRu: "Работать строго по техкарте",
        textVn: "Làm đúng theo công thức và quy trình chuẩn",
      },
      {
        key: "C",
        textRu: "Менять порцию по ситуации",
        textVn: "Thay đổi khẩu phần tùy tình huống",
      },
      {
        key: "D",
        textRu: "Добавлять ингредиенты по вкусу",
        textVn: "Thêm nguyên liệu theo khẩu vị",
      },
    ],
    correct: "B",
  },
  {
    id: "q02",
    number: 2,
    promptRu: "Можно ли самостоятельно менять количество ингредиентов в техкарте?",
    promptVn: "Có được tự ý thay đổi lượng nguyên liệu trong công thức chuẩn không?",
    options: [
      { key: "A", textRu: "Да", textVn: "Có" },
      { key: "B", textRu: "Только если мало продукта", textVn: "Chỉ khi thiếu nguyên liệu" },
      { key: "C", textRu: "Нет", textVn: "Không" },
      { key: "D", textRu: "Только в конце смены", textVn: "Chỉ cuối ca" },
    ],
    correct: "C",
  },
  {
    id: "q03",
    number: 3,
    promptRu: "Что нужно сделать, если сотрудник заметил проблему с рецептом?",
    promptVn: "Nhân viên phải làm gì nếu phát hiện vấn đề với công thức?",
    options: [
      { key: "A", textRu: "Исправить самостоятельно", textVn: "Tự sửa" },
      {
        key: "B",
        textRu: "Сообщить старшему или bếp trưởng",
        textVn: "Báo quản lý hoặc bếp trưởng",
      },
      { key: "C", textRu: "Игнорировать", textVn: "Bỏ qua" },
      { key: "D", textRu: "Изменить ингредиенты", textVn: "Đổi nguyên liệu" },
    ],
    correct: "B",
  },
  {
    id: "q04",
    number: 4,
    promptRu: "Что из перечисленного соответствует правильной личной гигиене?",
    promptVn: "Điều nào sau đây đúng với vệ sinh cá nhân?",
    options: [
      { key: "A", textRu: "Грязная форма", textVn: "Đồng phục bẩn" },
      { key: "B", textRu: "Длинные ногти", textVn: "Móng tay dài" },
      {
        key: "C",
        textRu: "Чистая форма, чистые руки и убранные волосы",
        textVn: "Đồng phục sạch, tay sạch và tóc được buộc gọn",
      },
      {
        key: "D",
        textRu: "Кольца и браслеты при работе",
        textVn: "Đeo nhẫn và vòng tay khi làm việc",
      },
    ],
    correct: "C",
  },
  {
    id: "q05",
    number: 5,
    promptRu: "Когда необходимо мыть руки?",
    promptVn: "Khi nào phải rửa tay?",
    options: [
      { key: "A", textRu: "Только перед началом смены", textVn: "Chỉ trước ca" },
      {
        key: "B",
        textRu:
          "После туалета, сырого мяса, мусора, телефона и перед готовой едой",
        textVn:
          "Sau khi đi vệ sinh, xử lý thịt sống, rác, điện thoại và trước thực phẩm chín",
      },
      { key: "C", textRu: "Только после уборки", textVn: "Chỉ sau khi vệ sinh" },
      {
        key: "D",
        textRu: "Только если руки выглядят грязными",
        textVn: "Chỉ khi tay nhìn bẩn",
      },
    ],
    correct: "B",
  },
  {
    id: "q06",
    number: 6,
    promptRu: "Минимальное время тщательного мытья рук:",
    promptVn: "Thời gian tối thiểu để rửa tay kỹ:",
    options: [
      { key: "A", textRu: "5 секунд", textVn: "5 giây" },
      { key: "B", textRu: "10 секунд", textVn: "10 giây" },
      { key: "C", textRu: "20 секунд", textVn: "20 giây" },
      { key: "D", textRu: "60 секунд", textVn: "60 giây" },
    ],
    correct: "C",
  },
  {
    id: "q07",
    number: 7,
    promptRu: "Заменяют ли перчатки мытье рук?",
    promptVn: "Găng tay có thay thế việc rửa tay không?",
    options: [
      { key: "A", textRu: "Да", textVn: "Có" },
      { key: "B", textRu: "Нет", textVn: "Không" },
      { key: "C", textRu: "Только при работе с мясом", textVn: "Chỉ khi làm thịt" },
      { key: "D", textRu: "Только новые перчатки", textVn: "Chỉ găng mới" },
    ],
    correct: "B",
  },
  {
    id: "q08",
    number: 8,
    promptRu: "После работы с сырым мясом в перчатках сотрудник должен:",
    promptVn: "Sau khi xử lý thịt sống bằng găng tay, nhân viên phải:",
    options: [
      {
        key: "A",
        textRu: "Продолжить собирать готовую еду",
        textVn: "Tiếp tục làm thực phẩm chín",
      },
      {
        key: "B",
        textRu: "Снять перчатки, вымыть руки и надеть новые",
        textVn: "Tháo găng, rửa tay và đeo găng mới",
      },
      { key: "C", textRu: "Протереть перчатки салфеткой", textVn: "Lau găng" },
      {
        key: "D",
        textRu: "Надеть вторую пару поверх",
        textVn: "Đeo thêm một lớp găng",
      },
    ],
    correct: "B",
  },
  {
    id: "q09",
    number: 9,
    promptRu: "Можно ли использовать телефон во время приготовления еды?",
    promptVn: "Có được sử dụng điện thoại trong khi chế biến món ăn không?",
    options: [
      { key: "A", textRu: "Да", textVn: "Có" },
      { key: "B", textRu: "Нет", textVn: "Không" },
      { key: "C", textRu: "Только в перчатках", textVn: "Chỉ khi đeo găng" },
      {
        key: "D",
        textRu: "Только возле разделочной доски",
        textVn: "Chỉ gần thớt",
      },
    ],
    correct: "B",
  },
  {
    id: "q10",
    number: 10,
    promptRu:
      "Что нужно сделать после использования телефона перед продолжением работы?",
    promptVn:
      "Sau khi sử dụng điện thoại, trước khi tiếp tục làm việc phải làm gì?",
    options: [
      { key: "A", textRu: "Только убрать телефон", textVn: "Chỉ cất điện thoại" },
      {
        key: "B",
        textRu: "Убрать телефон, вымыть руки и надеть новые перчатки",
        textVn: "Cất điện thoại, rửa tay và đeo găng mới",
      },
      {
        key: "C",
        textRu: "Протереть руки полотенцем",
        textVn: "Lau tay bằng khăn",
      },
      { key: "D", textRu: "Ничего", textVn: "Không cần làm gì" },
    ],
    correct: "B",
  },
  {
    id: "q11",
    number: 11,
    promptRu: "Где должны храниться личные вещи сотрудника?",
    promptVn: "Đồ dùng cá nhân của nhân viên phải để ở đâu?",
    options: [
      { key: "A", textRu: "На рабочем столе", textVn: "Trên bàn làm việc" },
      { key: "B", textRu: "Рядом с продуктами", textVn: "Gần thực phẩm" },
      {
        key: "C",
        textRu: "В специально отведенном месте вне рабочей зоны",
        textVn: "Ở khu vực riêng ngoài khu làm việc",
      },
      { key: "D", textRu: "На разделочной доске", textVn: "Trên thớt" },
    ],
    correct: "C",
  },
  {
    id: "q12",
    number: 12,
    promptRu: "Как правильно поддерживать рабочее место?",
    promptVn: "Cách đúng để duy trì khu vực làm việc là gì?",
    options: [
      { key: "A", textRu: "Убирать только в конце смены", textVn: "Chỉ dọn cuối ca" },
      {
        key: "B",
        textRu: "Убирать и вытирать сразу, возвращать инвентарь на место",
        textVn: "Dọn và lau ngay, trả dụng cụ về đúng vị trí",
      },
      {
        key: "C",
        textRu: "Оставлять грязную посуду до закрытия",
        textVn: "Để đồ bẩn đến khi đóng cửa",
      },
      { key: "D", textRu: "Складывать отходы на столе", textVn: "Để rác trên bàn" },
    ],
    correct: "B",
  },
  {
    id: "q13",
    number: 13,
    promptRu:
      "Что делать, если продукт странно пахнет, изменил цвет или упаковка повреждена?",
    promptVn:
      "Phải làm gì nếu sản phẩm có mùi lạ, đổi màu hoặc bao bì bị hỏng?",
    options: [
      { key: "A", textRu: "Использовать быстрее", textVn: "Dùng nhanh" },
      {
        key: "B",
        textRu: "Остановиться, не использовать и сообщить старшему",
        textVn: "Dừng lại, không sử dụng và báo quản lý",
      },
      {
        key: "C",
        textRu: "Смешать с новым продуктом",
        textVn: "Trộn với sản phẩm mới",
      },
      { key: "D", textRu: "Спрятать проблему", textVn: "Che giấu vấn đề" },
    ],
    correct: "B",
  },
  {
    id: "q14",
    number: 14,
    promptRu: "Какой главный стандарт сотрудника указан в материале?",
    promptVn: "Tiêu chuẩn chính của nhân viên được nêu trong tài liệu là gì?",
    options: [
      {
        key: "A",
        textRu: "Быстро, даже если неточно",
        textVn: "Nhanh dù không chính xác",
      },
      {
        key: "B",
        textRu: "Чисто, точно, по техкарте, безопасно и надежно",
        textVn: "Sạch sẽ, chính xác, đúng công thức, an toàn và đáng tin cậy",
      },
      {
        key: "C",
        textRu: "Каждый работает по-своему",
        textVn: "Mỗi người làm theo cách riêng",
      },
      { key: "D", textRu: "Главное - только скорость", textVn: "Chỉ cần tốc độ" },
    ],
    correct: "B",
  },
  {
    id: "q15",
    number: 15,
    promptRu: "Как часто формируется заказ продуктов?",
    promptVn: "Đơn đặt hàng thực phẩm được lập bao lâu một lần?",
    options: [
      { key: "A", textRu: "Раз в неделю", textVn: "Mỗi tuần" },
      {
        key: "B",
        textRu: "Перед каждой рабочей сменой",
        textVn: "Trước mỗi ca làm việc",
      },
      {
        key: "C",
        textRu: "Только когда всё закончилось",
        textVn: "Chỉ khi hết hàng",
      },
      { key: "D", textRu: "Раз в месяц", textVn: "Mỗi tháng" },
    ],
    correct: "B",
  },
  {
    id: "q16",
    number: 16,
    promptRu: "Когда отправляется дневной заказ продуктов?",
    promptVn: "Đơn đặt hàng ca ngày được gửi khi nào?",
    options: [
      { key: "A", textRu: "8:00-8:30", textVn: "8:00-8:30" },
      { key: "B", textRu: "10:00-10:30", textVn: "10:00-10:30" },
      { key: "C", textRu: "17:00-17:30", textVn: "17:00-17:30" },
      { key: "D", textRu: "После закрытия", textVn: "Sau khi đóng cửa" },
    ],
    correct: "A",
  },
  {
    id: "q17",
    number: 17,
    promptRu: "Когда отправляется вечерний заказ продуктов?",
    promptVn: "Đơn đặt hàng ca tối được gửi khi nào?",
    options: [
      { key: "A", textRu: "8:00-8:30", textVn: "8:00-8:30" },
      { key: "B", textRu: "12:00-12:30", textVn: "12:00-12:30" },
      { key: "C", textRu: "17:00-17:30", textVn: "17:00-17:30" },
      { key: "D", textRu: "22:00-22:30", textVn: "22:00-22:30" },
    ],
    correct: "C",
  },
  {
    id: "q18",
    number: 18,
    promptRu: "Как должна происходить выдача товара?",
    promptVn: "Hàng hóa phải được bàn giao như thế nào?",
    options: [
      { key: "A", textRu: "В пакетах на полу", textVn: "Trong túi đặt dưới sàn" },
      {
        key: "B",
        textRu: "Через дверь заднего входа, в корзине, без пакетов",
        textVn: "Qua cửa sau, trong giỏ, không dùng túi",
      },
      {
        key: "C",
        textRu: "Через главный вход в пакетах",
        textVn: "Qua cửa chính trong túi",
      },
      { key: "D", textRu: "Способ не важен", textVn: "Cách nào cũng được" },
    ],
    correct: "B",
  },
  {
    id: "q19",
    number: 19,
    promptRu: "Что необходимо сделать с посудой и гастроемкостями перед выдачей?",
    promptVn: "Cần làm gì với khay và dụng cụ trước khi giao hàng?",
    options: [
      { key: "A", textRu: "Оставить как есть", textVn: "Để nguyên" },
      {
        key: "B",
        textRu: "Тщательно вымыть и вернуть в чистом виде",
        textVn: "Rửa kỹ và trả lại sạch",
      },
      { key: "C", textRu: "Выбросить", textVn: "Bỏ đi" },
      { key: "D", textRu: "Сложить в пакеты", textVn: "Cho vào túi" },
    ],
    correct: "B",
  },
  {
    id: "q20",
    number: 20,
    promptRu: "Куда отправляется Activity Check List после рабочей смены?",
    promptVn: "Activity Check List được gửi đi đâu sau ca làm việc?",
    options: [
      { key: "A", textRu: "В группу REPORT в Zalo", textVn: "Vào nhóm REPORT trên Zalo" },
      { key: "B", textRu: "В группу ORDERS", textVn: "Vào nhóm ORDERS" },
      { key: "C", textRu: "В Poster", textVn: "Vào Poster" },
      { key: "D", textRu: "Никуда", textVn: "Không gửi" },
    ],
    correct: "A",
  },
  {
    id: "q21",
    number: 21,
    promptRu: "Когда сотрудник отправляет Activity Check List?",
    promptVn: "Nhân viên gửi Activity Check List khi nào?",
    options: [
      {
        key: "A",
        textRu: "Перед закрытием своей рабочей смены",
        textVn: "Trước khi kết thúc ca làm việc của mình",
      },
      { key: "B", textRu: "Раз в неделю", textVn: "Mỗi tuần" },
      { key: "C", textRu: "В начале месяца", textVn: "Đầu tháng" },
      {
        key: "D",
        textRu: "Только по просьбе менеджера",
        textVn: "Chỉ khi quản lý yêu cầu",
      },
    ],
    correct: "A",
  },
  {
    id: "q22",
    number: 22,
    promptRu:
      "Что требуется для расходов на приобретение продуктов и других расходов?",
    promptVn: "Chi phí mua thực phẩm và các khoản chi khác cần gì?",
    options: [
      { key: "A", textRu: "Устное подтверждение", textVn: "Xác nhận miệng" },
      {
        key: "B",
        textRu: "Документы или подтверждение чеком",
        textVn: "Chứng từ hoặc hóa đơn xác nhận",
      },
      {
        key: "C",
        textRu: "Только фотография продукта",
        textVn: "Chỉ ảnh sản phẩm",
      },
      { key: "D", textRu: "Ничего", textVn: "Không cần" },
    ],
    correct: "B",
  },
  {
    id: "q23",
    number: 23,
    promptRu: "Куда должны быть заведены все расходы?",
    promptVn: "Tất cả chi phí phải được nhập vào đâu?",
    options: [
      { key: "A", textRu: "Zalo", textVn: "Zalo" },
      { key: "B", textRu: "Poster", textVn: "Poster" },
      { key: "C", textRu: "Grab", textVn: "Grab" },
      { key: "D", textRu: "Личный блокнот", textVn: "Sổ cá nhân" },
    ],
    correct: "B",
  },
  {
    id: "q24",
    number: 24,
    promptRu: "Когда кассовые чеки должны быть отправлены в группу REPORT?",
    promptVn: "Hóa đơn thu ngân phải được gửi vào nhóm REPORT khi nào?",
    options: [
      {
        key: "A",
        textRu: "В течение кассовой смены сотрудника",
        textVn: "Trong suốt ca thu ngân của nhân viên",
      },
      { key: "B", textRu: "Раз в месяц", textVn: "Mỗi tháng" },
      {
        key: "C",
        textRu: "Только после проверки менеджера",
        textVn: "Chỉ sau khi quản lý kiểm tra",
      },
      { key: "D", textRu: "На следующий день", textVn: "Ngày hôm sau" },
    ],
    correct: "A",
  },
  {
    id: "q25",
    number: 25,
    promptRu: "Когда отправляется отчет о закрытии кассовой смены?",
    promptVn: "Báo cáo đóng ca thu ngân được gửi khi nào?",
    options: [
      {
        key: "A",
        textRu: "При закрытии кассовой смены сотрудника",
        textVn: "Khi nhân viên đóng ca thu ngân",
      },
      {
        key: "B",
        textRu: "В начале следующей смены",
        textVn: "Đầu ca tiếp theo",
      },
      { key: "C", textRu: "Раз в неделю", textVn: "Mỗi tuần" },
      {
        key: "D",
        textRu: "Только при наличии ошибки",
        textVn: "Chỉ khi có lỗi",
      },
    ],
    correct: "A",
  },
];
