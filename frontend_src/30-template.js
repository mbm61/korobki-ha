  var HTML = '<style>' + STYLE + '</style>' +
    '<div class="wrap">' +
    '<header class="top"><div class="srow">' +
    '<button class="menu" id="menu" hidden aria-label="Меню"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
    '<label class="search"><span class="sr">Поиск</span>' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
    '<input id="q" type="search" placeholder="Поиск вещей" autocomplete="off"></label>' +
    '<button class="iconbtn" id="filtBtn" aria-label="Фильтры" title="Фильтры"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5Z"/></svg></button>' +
    '<button class="iconbtn" id="catsBtn" aria-label="Категории" title="Категории"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16"/></svg></button>' +
    '<button class="iconbtn net" id="netBtn" aria-label="Состояние связи"></button></div>' +
    '<div class="toprow"><button class="menu" id="back" hidden aria-label="Назад"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<nav class="crumbs" id="crumbs" aria-label="Путь"></nav></div>' +
    '</header>' +
    '<main id="view"></main><footer class="foot" id="foot"></footer>' +
    '<nav class="bnav" id="bnav" hidden aria-label="Навигация"><button data-home aria-label="В корень дома"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7M6 10v10h12V10"/></svg>Домой</button>' +
    '<button data-goback aria-label="Назад"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Назад</button></nav></div>' +
    '<div class="sheet" id="sheet" hidden></div><div class="toast" id="toast" hidden></div>' +
    '<input class="sr" id="pick" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true">' +
    '<input class="sr" id="impick" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">';

