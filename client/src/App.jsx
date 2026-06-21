import { Routes, Route } from 'react-router-dom'
import TopNav from './components/TopNav.jsx'
import HomePage from './pages/HomePage.jsx'
import ForgePage from './pages/ForgePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

export default function App() {
  return (
    <div className="app">
      <TopNav />
      <div className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/forge" element={<ForgePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
    </div>
  )
}
