// SubGrid widget
// Adds sub grid

class WidgetSubGridVideoOverlay extends WidgetSubGrid {
    constructor(options) {
        super(options)
    }

    getContentForRender(parentsBB) {
        const BB = this.widget_div.getBoundingClientRect()

        // This widget
        let items = [{
            pos: { 
                x: BB.x - parentsBB.x,
                y: BB.y - parentsBB.y,
                height: BB.height,
                width: BB.width
            },
            content: this.widget_div
        }]

        // Add sub widgets
        for (const widget of this.grid.getGridItems()) {
            items = items.concat(widget.getContentForRender(parentsBB))
        }

        return items
    }

    loadLog() {
        if (this.grid == null) {
            return
        }
        for (const widget of this.grid.getGridItems()) {
            widget.loadLog()
        }
    }

    setTime(time) {
        if (this.grid == null) {
            return Promise.resolve()
        }
        let timeUpdate = []
        for (const widget of this.grid.getGridItems()) {
            timeUpdate.push(widget.setTime(time))
        }
        return Promise.allSettled(timeUpdate)
    }

}
customElements.define('widget-subgrid-video-overlay', WidgetSubGridVideoOverlay)
