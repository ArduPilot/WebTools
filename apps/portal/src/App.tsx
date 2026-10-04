import { developmentTools, tools } from './tools'

const base = import.meta.env.BASE_URL
const localUrl = (path: string) => base + path
const linkUrl = (path: string) => path.startsWith('https://') ? path : localUrl(path)

export default function App() {
  const isDevelopment = window.location.pathname.startsWith(localUrl('Dev/'))
  const title = isDevelopment ? 'ArduPilot WIP Web Tools' : 'ArduPilot Web Tools'

  return (
    <>
      <title>{title}</title>
      <table style={{ width: 1200 }}><tbody><tr><td>
        <a href="https://ardupilot.org"><img src={localUrl('images/ArduPilot.png')} alt="ArduPilot" /></a>
      </td><td>
        <a href="https://github.com/ArduPilot/WebTools"><img src={localUrl('images/github-mark.png')} style={{ width: 60 }} alt="GitHub" /></a>
        <br />
        <a href="https://github.com/ArduPilot/WebTools"><img src={localUrl('images/GitHub_Logo.png')} style={{ width: 60 }} alt="GitHub" /></a>
      </td></tr></tbody></table>
      <h1 style={{ textAlign: 'center', width: 1200 }}><a href="" style={{ color: '#000000', textDecoration: 'none' }}>{title}</a></h1>
      <div style={{ maxWidth: 1200 }}>
        {isDevelopment ? 'The tools on this page are either developer focused, or a work in progress, they are likely to be a little rough.' : <>
          A number of web-based tools for ArduPilot log and parameter review. These tools operate on the client side, no data is uploaded to any server at any time. <br />
          Many of the tools have a "Open In" button, this allows a log that has been opened in one tool to be transferred to another, the selected tool will be opened in a new tab and the log loaded.
        </>}
      </div>
      <table><tbody>
        {(isDevelopment ? developmentTools : tools).map(tool => (
          <tr key={tool.path}>
            <td>
              <a href={linkUrl(tool.path)} style={{ margin: 20, display: 'inline-block' }}>
                <img src={localUrl(tool.image)} alt={tool.name} style={tool.square ? { width: 200, height: 200, backgroundColor: '#f0f0f0' } : { width: 200 }} />
              </a>
            </td>
            <td style={{ textAlign: 'left', verticalAlign: 'top', maxWidth: 960 }}>
              <h2>{tool.name}</h2>
              {tool.description}
            </td>
          </tr>
        ))}
      </tbody></table>
    </>
  )
}
