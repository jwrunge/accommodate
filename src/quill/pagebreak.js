import Parchment from 'parchment'

export class PageBreakBlot extends Parchment.Block {
    static create() {
        let node = super.create()
        node.setAttribute('page-break-after', 'always')
        node.setAttribute('background-color', 'gray')
        node.setAttribute('height', '10px')
        return node
    }

    static formats(domNode) {
        return domNode.getAttribute('page-break-after') || 'always'
    }

    format(name, value) {
        if(name === 'pagebreak' && value) {
            this.domNode.setAttribute('page-break-after', value)
        }
        else {
            super.format(name, value)
        }
    }

    formats() {
        let formats = super.formats()
        formats['pagebreak'] = PageBreakBlot.formats(this.domNode)
        return formats
    }
}

PageBreakBlot.blotName = 'pagebreak'
PageBreakBlot.tagName = 'div'

Parchment.register(PageBreakBlot)