function onBtnClick(event) {
  return event;
}

const panel = {
  init: function () {
    document.querySelector("#qunit-fixture").innerHTML = `<div id="panel">
      <button id="panel-btn">OK</button>
    </div>`;
    return this;
  },

  onDomLoaded: function () {
    const btn = document.getElementById("#panel-btn");
    btn.addEventListener('click', omBtnClick);
  }
};

module.exports = panel.init();