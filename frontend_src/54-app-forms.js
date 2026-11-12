    /* Категории при добавлении: выпадающий список с галочками и строкой «новая категория» */
    function ddSummary() {
      var names = S.addTags.map(catById).filter(Boolean).map(function (c) { return '#' + c.n; });
      return names.length ? names.join(', ') : 'Не выбрано';
    }
    function addCatsHtml() {
      var sel = S.addTags, h = '<div class="sec">Категории</div><div class="dd">' +
        '<button type="button" class="ddbtn" data-dd aria-haspopup="listbox" aria-expanded="' + S.dd + '"><span id="ddsum" class="ddsum">' + esc(ddSummary()) + '</span>' + svg('chevd', 20) + '</button>' +
        '<div class="ddlist" id="ddlist"' + (S.dd ? '' : ' hidden') + '>';
      h += settings.cats.map(function (c) {
        var on = sel.indexOf(c.id) > -1;
        return '<button type="button" class="ddrow' + (on ? ' on' : '') + '" role="option" style="--c:' + c.c + '" data-addtag="' + c.id + '" aria-selected="' + on + '"><span class="ddchk">' + svg('check', 16) + '</span><span class="ddname">#' + esc(c.n) + '</span></button>';
      }).join('');
      return h + '<div class="ddnew"><input id="fNewCat" type="text" autocomplete="off" placeholder="Новая категория" value="' + esc(S.draftCat) + '" aria-label="Новая категория">' +
        ib('data-ddadd', 'plus', 'Создать категорию', 'primary') + '</div></div></div>';
    }
