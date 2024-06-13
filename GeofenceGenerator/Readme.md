## Geofence Generator

A tool to extract data from [OpenStreetMap](https://www.openstreetmap.org/) using the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).

So far only body's of water are implemented with the following tags:

* [landuse=reservoir](https://wiki.openstreetmap.org/wiki/Tag:landuse=reservoir)
* [natural=water](https://wiki.openstreetmap.org/wiki/Tag:natural%3Dwater) without water tag
* [water=lake](https://wiki.openstreetmap.org/wiki/Tag:water%3Dlake)
* [water=reservoir](https://wiki.openstreetmap.org/wiki/Tag:water%3Dreservoir)
* [water=basin](https://wiki.openstreetmap.org/wiki/Tag:water%3Dbasin)
* [water=lagoon](https://wiki.openstreetmap.org/wiki/Tag:water%3Dlagoon)
* [water=pond](https://wiki.openstreetmap.org/wiki/Tag:water%3Dpond)

> [!NOTE]
> Unlike the other tools this will not work offline. This is because it is reliant on the OSM Overpass API, so would not operate at all offline. Due to this the packages it needs are also loaded from CDNs.
