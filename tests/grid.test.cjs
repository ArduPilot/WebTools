const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function draw(dpr) {
    const lines=[],ctx={scale:1,dx:0,dy:0,
        setTransform(a){this.scale=a;},clearRect(){},save(){},restore(){},beginPath(){},stroke(){},
        translate(x,y){this.dx=x;this.dy=y;},
        moveTo(x,y){lines.push([(x+this.dx)*this.scale/dpr,(y+this.dy)*this.scale/dpr]);},lineTo(){}};
    const canvas={style:{},getContext:()=>ctx};
    const bounds={getNorth:()=>10,getSouth:()=>0,getWest:()=>0,getEast:()=>10,getNorthWest:()=>({x:0,y:10}),getSouthEast:()=>({x:10,y:0})};
    const map={getPanes:()=>({overlayPane:{appendChild(){}}}),getSize:()=>({x:100,y:100}),
        getBounds:()=>bounds,getCenter:()=>({lat:0}),getZoom:()=>20,
        options:{crs:{project:p=>p,unproject:p=>p}},
        containerPointToLayerPoint:()=>({x:3,y:7}),latLngToLayerPoint:p=>({x:p.x*10,y:p.y*10}),on(){}};
    const window={devicePixelRatio:dpr};
    vm.runInNewContext(fs.readFileSync('SimpleGCS/grid.js','utf8'),{window,document:{createElement:()=>canvas},L:{latLngBounds:()=>bounds,point:(x,y)=>({x,y})}});
    window.MetricGrid.init(map);window.MetricGrid.on();
    assert.equal(canvas.width,100*dpr);return lines;
}
test('grid positions and spacing are identical in CSS pixels at DPR 1, 2 and 3',()=>{
    const expected=draw(1);assert.ok(expected.length>2);assert.deepEqual(draw(2),expected);assert.deepEqual(draw(3),expected);
});
