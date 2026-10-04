import type { ReactNode } from 'react'

export interface Tool {
  path: string
  image: string
  name: string
  square: boolean
  description: ReactNode
}

export const tools: readonly Tool[] = [
  {
    path: "LogFinder",
    image: "images/LogFinder_Icon.png",
    name: "Log Finder",
    square: false,
    description: "A tool load and sort directories of logs. Note that directory read is not supported by all browsers. Logs are sorted by the unique hardware ID of the flight controller. Parameter changes are tracked between logs. Open in links allow files to be easily opened in any of the other tools.",
  },
  {
    path: "https://plot.ardupilot.org/#/",
    image: "images/UAVLogViewer_Icon.gif",
    name: "UAV Log viewer",
    square: false,
    description: "General purpose ArduPilot log review with 3D flight visualization.",
  },
  {
    path: "HardwareReport",
    image: "images/HardwareReport_Icon.png",
    name: "Hardware Report",
    square: false,
    description: "Provides a overview of connected hardware from a parameter file or log. If a log is used more information can be provided, such as sensor health status and exact firmware version. A range of options are available to extract parameters from logs, all, only changed or minimal removing calibration parameters. Includes visualization for sensor position offsets.",
  },
  {
    path: "MAGFit",
    image: "images/MAGFit_Icon.png",
    name: "MAGFit",
    square: false,
    description: "Calibrate compass from flight log. This tool fits the logged magnetometer data to the world magnetic model providing offsets, iron correction, scale, motor compensation and checking orientation.",
  },
  {
    path: "FilterReview",
    image: "images/FilterReview_Icon.png",
    name: "Filter Review",
    square: false,
    description: "Gyro noise and filter configuration tool. Uses raw or batch IMU logs to show the vehicles noise profile. Filters can are applied logged pre-filter data to see the effect without the need to fly again.",
  },
  {
    path: "PIDReview",
    image: "images/PIDReview_Icon.png",
    name: "PID Review",
    square: false,
    description: "Review PID tune in the frequency domain. Step response estimate is generated. Results are split based on parameter changes.",
  },
  {
    path: "FilterTool",
    image: "images/FilterTool_Icon.png",
    name: "Filter Tool",
    square: false,
    description: "Bode plot tool to give insight into gyro low pass and notch filter setup. This tool visualizes the attenuation and phase lag of a filter setup loaded from a parameter file. For filter setup the FilterReview tool it is recommended it provides the same bode plot feedback. This filter tool allows the attenuation and phase lag of each filter to be plotted individually, something which the filter reivew tool cannot do. This tool also provides a estimated response for the rate PID gains.",
  },
  {
    path: "DFULoader",
    image: "images/DFULoader_Icon.png",
    name: "DFU Loader",
    square: false,
    description: "The DFU loader allows you to load an ArduPilot bootloader via DFU on USB",
  },
  {
    path: "Dev",
    image: "images/under-construction-sign-icon.png",
    name: "Work in progress tools",
    square: false,
    description: "The tools that are a work in progress, they are likely to be a little rough.",
  },
]

export const developmentTools: readonly Tool[] = [
  {
    path: "StreamStats",
    image: "images/StreamStats_Icon.png",
    name: "Stream stats",
    square: false,
    description: "Message rate analysis for tlogs and bin logs.",
  },
  {
    path: "KinematicTool",
    image: "images/KinematicTool_Icon.png",
    name: "Kinematic Tool",
    square: false,
    description: "A tool to help understanding of attitude control input shaping.",
  },
  {
    path: "GeofenceGenerator",
    image: "images/GeofenceGenerator_Icon.png",
    name: "Geofence Generator",
    square: false,
    description: "Generates ArduPilot geofences from Open Street Map waterway data.",
  },
  {
    path: "RotationCheck",
    image: "images/RotationCheck_Icon.png",
    name: "Rotation Check",
    square: false,
    description: "A tool to help understand of rotations.",
  },
  {
    path: "SysID",
    image: "images/sysid_python_stateSpace.png",
    name: "SysID",
    square: true,
    description: "A tool for identifying state-space or transfer function models for UAV dynamics",
  },
  {
    path: "TelemetryDashboard",
    image: "images/TelemetryDashboard_Icon.png",
    name: "TelemetryDashboard",
    square: false,
    description: <>Telemetry Dashboard allows customizable data displays from a MAVLink telemetry stream. Requires a WebSocket server to forward raw binary MAVLink. Attempts to auto connect to MissionPlanner at <code>ws://127.0.0.1:56781</code>. Latest PyMAVLink can also be used eg: <a href="https://github.com/IamPete1/pymavlink/blob/WebSocket_forwarding_example/examples/mavtcpsniff.py">TCP to WebSocket</a>. This is read only, MAVLink commands are not sent (including stream rate requests). This is not a GCS replacement.</>,
  },
  {
    path: "AnalyticTune",
    image: "images/analytictune_pic.png",
    name: "Analytic Tune",
    square: true,
    description: "A tool for analytically tuning a multirotor or heli using system ID mode data",
  },
  {
    path: "ThrustExpo",
    image: "images/ThrustExpo_Icon.png",
    name: "Thrust Expo",
    square: false,
    description: "Use thrust test stand data to analyze motor thrust linearity. Visualizes the relationship between measured thrust and throttle input, along with a plot of the thrust expo curve for optimization of MOT_THST_EXPO to achieve linear thrust response. Can also estimate hover throttle.",
  },
  {
    path: "AILogAnalyzer",
    image: "images/AILogAnalyzer_Icon.png",
    name: "AI Log Analyzer",
    square: false,
    description: "AI Log Analyzer module Use an AI agent to analyze your logs file",
  },
  {
    path: "SCurveTool",
    image: "images/SCurveTool_Icon.png",
    name: "SCurve Kinematic Tool",
    square: false,
    description: "A tool to help understanding s-curve trajectories.",
  },
  {
    path: "VideoOverlay",
    image: "images/VideoOverlay_Icon.png",
    name: "Video Overlay",
    square: false,
    description: "Synchronise ArduPilot DataFlash log telemetry with video footage and export a composited video with telemetry overlay. Load a .bin log file and video, arrange your widgets, set the sync offset, and export.",
  },
  {
    path: "AirspeedFit",
    image: "images/AirspeedFit_Icon.png",
    name: "AirspeedFit",
    square: false,
    description: "Calibrate the airspeed ratio (ARSPD_RATIO) for one or more airspeed sensors from a flight log. The GPS/EKF ground velocity and an offline forward/backward wind estimate are used as the truth source for the wind triangle, the same relationship as ArduPilot's in-flight autocalibration. Reports the fitted wind, per-sensor residuals and calibration RMS.",
  },
  {
    path: "SimpleGCS",
    image: "images/SimpleGCS_Icon.png",
    name: "Simple GCS",
    square: false,
    description: "An example simple web based GCS. Setup for small boats (eg. autonomous buoy). Supports wss to connect via ArduPilot support server.",
  },
]
