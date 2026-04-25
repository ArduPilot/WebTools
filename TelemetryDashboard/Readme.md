## Telemetry Dashboard

This is a display only tool to help visualise incoming MAVLink telemetry data from multiple vehicles. 

This is not a GCS! It should be used in addition to a GCS.

Focus is on flexibility and user customization.

### New features

It now accepts multiple vehicles which you can add with the + button in the Connections tippy. Here you can enter the websocket address, a vehicle name and connect/disconnect/remove as you wish (upon disconnect, any widget with that vehicle selected will remove its content and its name from the options). There is a Primary Vehicle selector which when chosen and 'selected' pressed, sends that vehicle's messages to all widgets in the dashboard. Note, it overrides and removes any vehicles already selected and is primarily designed to speed up the setup time particularly for only using one vehicle.

The code now identified the vehicle type from the MAVLink messages and assigns different icons in the map for the following vehicle types: plane, copter, helicopter, antenna tracker, gcs, blimp, balloon, rocket, rover, boat and sub. If the type has not been identified or is something not on the list, it defaults to a diamond shape.

When Edit is enabled (found in the Settings tippy), you can now select and deselect vehicles at each widget. The map and graphs accept multiple vehicles, all the rest only allow one vehicle's data. Each vehicle is assigned a colour at random for easy identification across the dashboard and can be changed by clicking on the vehicle in the map which brings up a vehicle info popup (also new feature) where you can see the vehicle's websocket, name, coordinates, colour and MAVLink Inspector which has been moved inside here (it is still a widget which can be added and assigned a vehicle). 
