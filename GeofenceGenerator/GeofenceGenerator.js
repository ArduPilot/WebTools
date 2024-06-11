
// Helper to go from XML to GeoJSON. This tidy's up polygons for us.
// https://github.com/tyrasd/osmtogeojson
import('https://unpkg.com/osmtogeojson@3.0.0-beta.5/osmtogeojson.js')

const min_zoom = 11
function map_zoom() {
    // Disable search if map is not zoomed in enough, this limits the size of the API request
    const allow_search = map.getZoom() >= min_zoom
    document.getElementById("search").disabled = !allow_search
}

// Request data from API
let polygons = []
let crop_polygon
async function request() {
    if (map.getZoom() < min_zoom) {
        alert("Please Zoom in")
        return
    }

    // Clear existing polygons
    for (let i = 0; i < polygons.length; i += 1) {
        polygons[i].remove()
    }
    polygons = []

    // Remove crop polygon and enable button its button
    if (crop_polygon != null) {
        crop_polygon.remove()
        crop_polygon = null
    }
    document.getElementById("crop").disabled = false

    // Search the viewport
    const bb = map.getBounds()
    const bounds = "[bbox:" + bb._southWest.lat + "," + bb._southWest.lng + "," + bb._northEast.lat + "," + bb._northEast.lng + "];"

    const areas = 
       `(area[landuse=reservoir];
         area[natural=water][!water];
         area[water=lake];
         area[water=reservoir];
         area[water=basin];
         area[water=lagoon];
         area[water=pond];)-> .water;
         relation(pivot.water);
        out geom;`

    const ways = 
       `(way[landuse=reservoir];
         way[natural=water][!water];
         way[water=lake];
         way[water=pond];
         way[water=basin];
         way[water=lagoon];
         way[water=reservoir];);
        out geom;`

    let request = "data=" + encodeURIComponent(bounds + areas + ways)
    let uri = "https://overpass-api.de/api/interpreter"

    // Make API request
    const data = await fetch(uri, {method:'POST', body:request,})

    // Extract XML
    const result = await data.text()
    const xml = new DOMParser().parseFromString(result,"text/xml");

    // Convert XML to GeoJSON
    const json = osmtogeojson(xml)

    function add_polygon(feature) {
        const polygon = L.geoJSON(feature)
        polygon.bindPopup(create_popup)
        polygon.addTo(map)
        polygons.push(polygon)
    }

    // Add to map
    for (const feature of json.features) {
        if (feature.geometry.type == "Polygon") {
            add_polygon(feature)

        } else if (feature.geometry.type == "MultiPolygon") {
            // Add each sub polygon as its own feature
            const len = feature.geometry.coordinates.length
            for (let i = 0; i < len; i += 1) {
                const poly = {
                    geometry: {
                        type: "Polygon",
                        coordinates: feature.geometry.coordinates[i]
                    },
                    id: feature.id,
                    type: feature.type,
                    properties: feature.properties
                }
                add_polygon(poly)
            }
        }
    }

}

// Add a editable cropping polygon
function add_crop() {
    const bb = map.getBounds()
    const northEast = map.project(bb._northEast)
    const southWest = map.project(bb._southWest)
    const radius = { x:(northEast.x - southWest.x) * 0.5, y:(southWest.y - northEast.y) * 0.5 }
    const center = { x:(northEast.x + southWest.x) * 0.5, y:(northEast.y + southWest.y) * 0.5 }

    const top = center.y - radius.y * 0.7
    const bottom = center.y + radius.y * 0.95
    const left = center.x - radius.x * 0.95
    const right = center.x + radius.x * 0.95

    const crop_poly_points = [
        map.unproject([right, top]),
        map.unproject([right, bottom]),
        map.unproject([left, bottom]),
        map.unproject([left, top]),
    ]

    if (crop_polygon != null) {
        crop_polygon.remove()
    }

    crop_polygon = L.polygon(crop_poly_points, { color: '#FF0000', fill: false }).addTo(map)
    crop_polygon.enableEdit()
}

// Make the popup for the given item
function create_popup(polygon) {
    const feature = polygon.feature
    const properties = feature.properties

    // Add name, user language if possible
    const div = document.createElement("div")
    let name = "Name: "

    const lang = navigator.language.split('-')[0]
    const name_tag = "name:" + lang

    let have_name = false
    let file_name
    if (name_tag in properties) {
        have_name = true
        file_name = properties[name_tag]
        name += properties[name_tag]
    }
    if ("name" in properties) {
        if (have_name) {
            name += " (" + properties["name"] + ")"
        } else {
            name += properties["name"]
            file_name = properties["name"]
        }
        have_name = true
    }
    if (!have_name) {
        name += "unknown"
        file_name = "unknown"
    }

    div.appendChild(document.createTextNode(name))
    div.appendChild(document.createElement("br"))

    // Add number of points
    let points = 0
    for (const poly of feature.geometry.coordinates) {
        points += poly.length
    }

    div.appendChild(document.createTextNode("Points: " + points))
    div.appendChild(document.createElement("br"))

    // Add button to generate and download fence
    const button = document.createElement("input")
    button.setAttribute('value', 'Download')
    button.setAttribute('type', 'button')
    button.addEventListener("click", function() { loading_call(() => { generate_fence(feature, file_name) })})
    div.appendChild(button)

    return div
}

async function generate_fence(feature, name) {

    let polys = feature.geometry.coordinates
    if (crop_polygon != null) {
        // Apply crop polygon
        const cropped = turf.intersect(feature, crop_polygon.toGeoJSON())
        if (cropped == null) {
            alert("Selected polygon not in crop area")
            return
        }
        polys = cropped.geometry.coordinates
    }

    const len = polys.length

    // Origin for conversion to cartesian
    const origin = polys[0][0]

    // Convert to cartesian
    const cartesian = { x: new Array(len), y: new Array(len) }
    for (let i = 0; i<len; i++) {
        const points = polys[i]
        let xy_len = points.length
        if ((points[0][0] == points[xy_len-1][0]) && (points[0][1] == points[xy_len-1][1])) {
            // Drop last point if it is the same as the first
            xy_len -= 1
            points.pop()
        }


        for (let i = 0; i < 228; i++) {
            points.push(points.shift());
        }

        const xy = convertToCartesian(points, xy_len, origin)
        cartesian.x[i] = xy.x
        cartesian.y[i] = xy.y
    }

    // Simplify
    const simplified = simplify_poly(cartesian.x, cartesian.y)

    // Convert back to lat, lon
    const lat_lon = new Array(len)
    for (let i = 0; i<len; i++) {
        lat_lon[i] = convertFromCartesian(simplified.x[i], simplified.y[i], origin)
    }

    // Save to file
    // sanitize name for use in file
    name = name.replace('/', '_')
    name = name.replace('\\', '_')

    let text = 'QGC WPL 110\n'
    let points = 1
    for (let i = 0; i<len; i++) {
        if (i == 0) {
            // first point is always inclusion
            poly_type = 5001
            circle_type = 5003
        } else {
            // all others exclusion
            poly_type = 5002
            circle_type = 5004
        }
        if (simplified.radius[i] == null) {
            // polygon points
            const poly_len = lat_lon[i].lat.length
            for (let j = 0; j<poly_len; j++) {
                text += `${points} 0 3 ${poly_type} ${poly_len} 0 0 0 ${lat_lon[i].lat[j].toFixed(6)} ${lat_lon[i].lon[j].toFixed(6)} ${j} 1\n`
                points += 1
            }
        } else {
            // Circle point
            text += `${points} 0 3 ${circle_type} ${simplified.radius[i]} 0 0 0 ${lat_lon[i].lat[0].toFixed(6)} ${lat_lon[i].lon[0].toFixed(6)} 0 1\n`
            points += 1
        }
    }

    let blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, name + ".waypoints");

}

function wrap_180(angle) {
    return ((angle + 180) % 360) - 180;
}

function longitude_scale(lat) {
    const scale = Math.cos(lat * (Math.PI / 180.0))
    return Math.max(scale, 0.01)
}

// convert lat lon to xy relative to origin point, note that GeoJSON uses [lon, lat]
const LATLON_TO_M = 6378100 * (Math.PI / 180.0);
function convertToCartesian(points, len, origin) {
  const ret = { x: new Array(len), y: new Array(len) }
  for (let i = 0; i < len; i++) {
    ret.x[i] = (points[i][1] - origin[1]) * LATLON_TO_M;
    ret.y[i] = wrap_180(points[i][0] - origin[0]) * LATLON_TO_M * longitude_scale((points[i][1] + origin[1]) * 0.5);
  }
  return ret;
}

// convert xy back to lat lon, note not GoeJSON format!
function convertFromCartesian(x, y, origin) {
  const len = x.length;
  const ret = { lat: new Array(len), lon: new Array(len) }
  for (let i = 0; i < len; i++) {
    const dlat = x[i] / LATLON_TO_M;
    ret.lon[i] = wrap_180(origin[0] + ((y[i] / LATLON_TO_M) / longitude_scale(origin[1] + dlat / 2)));
    ret.lat[i] = origin[1] + dlat;
  }
  return ret;
}

// https://en.wikipedia.org/wiki/Shoelace_formula
function polygon_area(x, y) {
    const len = x.length - 1
    let sum1 = x[len] * y[0]
    let sum2 = x[0]     * y[len]
    for (let i = 0; i<len; i++) {
        sum1 += x[i] * y[i+1]
        sum2 += y[i] * x[i+1]
    }
    return Math.abs(sum1 - sum2) * 0.5
}

// as above for thee points
function triangle_area(x, y) {
    const sum1 = x[2] * y[0] + x[0] * y[1] + x[1] * y[2]
    const sum2 = x[0] * y[2] + y[0] * x[1] + y[1] * x[2]
    return Math.abs(sum1 - sum2) * 0.5
}

// detect intersection between two points
function line_intersects(seg1_start, seg1_end, seg2_start, seg2_end) {

    // do Y first, X will not trip during sweep line intersection in X axis
    const min_y_1 = Math.min(seg1_start[1], seg1_end[1])
    const max_y_2 = Math.max(seg2_start[1], seg2_end[1])
    if (min_y_1 > max_y_2) {
        return false
    }

    const max_y_1 = Math.max(seg1_start[1], seg1_end[1])
    const min_y_2 = Math.min(seg2_start[1], seg2_end[1])
    if (max_y_1 < min_y_2) {
        return false
    }

    const min_x_1 = Math.min(seg1_start[0], seg1_end[0])
    const max_x_2 = Math.max(seg2_start[0], seg2_end[0])
    if (min_x_1 > max_x_2) {
        return false
    }

    const max_x_1 = Math.max(seg1_start[0], seg1_end[0])
    const min_x_2 = Math.min(seg2_start[0], seg2_end[0])
    if (max_x_1 < min_x_2) {
        return false
    }

    // implementation borrowed from http://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect
    const r1 = (seg1_end[0] - seg1_start[0], seg1_end[1] - seg1_start[1])
    const r2 = (seg2_end[0] - seg2_start[0], seg2_end[1] - seg2_start[1])
    const r1xr2 = r1[0]*r2[1] - r1[1]*r2[0]
    if (Math.abs(r1xr2) < 1e-09) {
        // either collinear or parallel and non-intersecting
        return false
    } else {
        const ss2_ss1 = (seg2_start[0] - seg1_start[0], seg2_start[1] - seg1_start[1])
        const q_pxr = ss2_ss1[0]*r1[1] - ss2_ss1[1]*r1[0]
        // t = (q - p) * s / (r * s)
        // u = (q - p) * r / (r * s)
        const t = (ss2_ss1[0]*r2[1] - ss2_ss1[1]*r2[0]) / r1xr2
        const u = q_pxr / r1xr2
        if ((u >= 0) && (u <= 1) && (t >= 0) && (t <= 1)) {
            // lines intersect
            // t can be any non-negative value because (p, p + r) is a ray
            // u must be between 0 and 1 because (q, q + s) is a line segment
            // intersection = seg1_start + (r1*t);
            return true
        }
    }

    // non-parallel and non-intersecting
    return false
}

// detect polygon self intersection
// https://github.com/rowanwins/sweepline-intersections
function polygon_intersects_sweep(x, y) {
    // list of lines in polygon
    const num_nodes = x.length

    lines = new Array(num_nodes)
    event_que = new Array(2*num_nodes)
    for (let i = 0; i<num_nodes; i++) {
        j = i+1
        if (j >= num_nodes) {
            j = 0
        }
        lines[i] = ((x[i],y[i]), (x[j], y[j]))
        if (x[i] <= x[j]) {
            event_que[i*2] = [x[i],i,true]
            event_que[(i*2)+1] = [x[j],i,false]
        } else {
            event_que[i*2] = [x[i],i,false]
            event_que[(i*2)+1] = [x[j],i,true]
        }
    }

    event_que.sort((a, b) => { return a[0] - b[0] })
    active = []
    for (const event of event_que) {
        if (event[2]) {
            // adding new line, intersect with active items
            const new_line = lines[event[1]]

            // don't compare adjacent lines in polygon
            let next_line = event[1] + 1
            if (next_line == num_nodes) {
                next_line = 0
            }
            let prev_line = event[1] - 1
            if (prev_line == -1) {
                prev_line = num_nodes - 1
            }

            for (let i = 0; i<active.length; i++) {
                if ((i == next_line) || (i == prev_line)) {
                    continue
                }
                if (line_intersects(new_line[0], new_line[1], active[i][0], active[i][1])) {
                    return true
                }
            }
            active[event[1]] = new_line

        } else {
            // remove line from active list
            active.pop(event[1])
        }
    }
    return false
}

// simplify polygon using Visvalingam–Whyatt
// https://en.wikipedia.org/wiki/Visvalingam%E2%80%93Whyatt_algorithm
// will not create self intersecting polygon
function simplify_poly(x, y) {

    // simplification area removal threshold, set 0 to disable area threshold
    const area_threshold = 100 // m^2

    // don't simplify to less than this number of nodes
    const min_nodes = 50

    // Keep trying until less than this number of nodes
    const max_nodes = 250

    const num_poly = x.length

    // Radius of circle fence if simplified
    const radius = new Array(num_poly)

    const poly_len = new Array(num_poly)
    const minimum_polygon = new Array(num_poly).fill(false)
    for (let i = 0; i<num_poly; i++) {
        poly_len[i] = x[i].length
        if (poly_len[i] <= 3) {
            minimum_polygon[i] = true
        }
    }

    if (array_all_equal(minimum_polygon, true) || (array_sum(poly_len) <= min_nodes)) {
        // cant simplify any further, fewer than min number of nodes
        return { x, y, radius }
    }

    for (let i = 0; i<num_poly; i++) {
        // try replacing polygon with circle
        const center_x = array_mean(x[i])
        const center_y = array_mean(y[i])
        let radius_sum = 0
        for (let j = 0; j<poly_len[i]; j++) {
            radius_sum += Math.sqrt(((x[i][j] - center_x) ** 2) + ((y[i][j] - center_y) ** 2))
        }
        const radius_mean = radius_sum / poly_len[i]
        const circle_area = Math.PI * (radius_mean ** 2)
        const poly_area = polygon_area(x[i], y[i])
        if (Math.abs(circle_area -  poly_area) < area_threshold) {
            x[i] = [center_x]
            y[i] = [center_y]
            radius[i] = radius_mean
            minimum_polygon[i] = true
            poly_len[i] = 1
        }
    }

    if (array_all_equal(minimum_polygon, true) || (array_sum(poly_len) <= min_nodes)) {
        // cant simplify any further, fewer than min number of nodes
        return { x, y, radius }
    }

    // Calculate the triangle areas for all polygons
    const area = new Array(num_poly)
    for (let i = 0; i<num_poly; i++) {
        if (minimum_polygon[i]) {
            continue
        }
        area[i] = new Array(poly_len[i])
        for (let j = 0; j<poly_len[i]; j++) {
            let prev_point = j - 1
            if (prev_point < 0) {
                prev_point = poly_len[i] - 1
            }

            let next_point = j + 1
            if (next_point >= poly_len[i]) {
                next_point = 0
            }
            area[i][j] = triangle_area([x[i][j], x[i][prev_point], x[i][next_point]], [y[i][j], y[i][prev_point], y[i][next_point]])
        }
    }

    while (true) {

        // Find the smallest triangle area over all polygons
        let min_poly_val = Number.POSITIVE_INFINITY
        let min_poly_index
        let index_min
        for (let i = 0; i<num_poly; i++) {
            if (minimum_polygon[i]) {
                continue
            }
            for (let j = 0; j<poly_len[i]; j++) {
                if (area[i][j] < min_poly_val) {
                    min_poly_val = area[i][j]
                    min_poly_index = i
                    index_min = j
                }
            }
        }

        if ((min_poly_val > area_threshold) && (array_sum(poly_len) <= max_nodes)) {
            // reached threshold, simplification complete
            break
        }

        // test if removing this point will create a self intersections
        let new_intersect = false
        let prev_point = index_min - 1
        if (prev_point < 0) {
            prev_point = poly_len[min_poly_index] - 1
        }

        let prev_prev_point = prev_point - 1
        if (prev_prev_point < 0) {
            prev_prev_point = poly_len[min_poly_index] - 1
        }

        let next_point = index_min + 1
        if (next_point >= poly_len[min_poly_index]) {
            next_point = 0
        }

        for (let i = 0; i<poly_len[min_poly_index]; i++) {
            // compare all lines except the adjacent
            if ((i == prev_prev_point) || (i == prev_point) || (i == index_min) || (i == next_point)) {
                continue
            }
            let test_next_point = i + 1
            if (test_next_point >= poly_len[min_poly_index]) {
                test_next_point = 0
            }
            if (line_intersects([x[min_poly_index][i], y[min_poly_index][i]], [x[min_poly_index][test_next_point], y[min_poly_index][test_next_point]], [x[min_poly_index][prev_point], y[min_poly_index][prev_point]], [x[min_poly_index][next_point], y[min_poly_index][next_point]])) {
                new_intersect = true
                break
            }
        }

        if (new_intersect) {
            // cant remove this point without creating intersection, set area inf so next smallest is selected
            area[min_poly_index][index_min] = Number.POSITIVE_INFINITY
            continue
        }

        // Remove point
        x[min_poly_index].splice(index_min, 1)
        y[min_poly_index].splice(index_min, 1)
        area[min_poly_index].splice(index_min, 1)
        poly_len[min_poly_index] -= 1

        if (poly_len[min_poly_index] == 3) {
            // cant simplify past 3 points
            minimum_polygon[min_poly_index] = true
        }

        if (array_all_equal(minimum_polygon, true) || (array_sum(poly_len) <= min_nodes)) {
            // cant simplify any further, fewer than min number of nodes
            break
        }

        // recalculate area for adjacent points
        for (let j of [index_min-1, index_min]) {

            if (j >= poly_len[min_poly_index]) {
                j = 0
            } else if (j < 0) {
                j = poly_len[min_poly_index] - 1
            }

            let prev_point = j - 1
            if (prev_point < 0) {
                prev_point = poly_len[min_poly_index] - 1
            }

            let next_point = j + 1
            if (next_point >= poly_len[min_poly_index]) {
                next_point = 0
            }

            area[min_poly_index][j] = triangle_area([x[min_poly_index][j], x[min_poly_index][prev_point], x[min_poly_index][next_point]], [y[min_poly_index][j], y[min_poly_index][prev_point], y[min_poly_index][next_point]])
        }

        // recalculate any areas set to inf to avoid intersections
        for (let j = 0; j<poly_len[min_poly_index]; j++) {
            if (Number.isFinite(area[min_poly_index][j])) {
                continue
            }

            let prev_point = j - 1
            if (prev_point < 0) {
                prev_point = poly_len[min_poly_index] - 1
            }
            let next_point = j + 1
            if (next_point >= poly_len[min_poly_index]) {
                next_point = 0
            }
            area[min_poly_index][j] = triangle_area([x[min_poly_index][j], x[min_poly_index][prev_point], x[min_poly_index][next_point]], [y[min_poly_index][j], y[min_poly_index][prev_point], y[min_poly_index][next_point]])
        }
    }

    return { x, y, radius }
}
