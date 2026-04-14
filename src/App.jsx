import { Routes, Route, Link } from 'react-router-dom'
import GarminDashboard from './pages/GarminDashboard'

function Home() {
  return (
    <div className="bg-gray-950 text-gray-100 min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">nekrasov11.ru</h1>
      <nav className="space-y-2 text-center">
        <Link to="/sport/garmin_dashboard" className="block text-indigo-400 hover:text-indigo-300 text-lg">
          Garmin Dashboard
        </Link>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sport/garmin_dashboard" element={<GarminDashboard />} />
    </Routes>
  )
}
