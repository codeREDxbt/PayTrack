import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Overview, People, TimeLeave, Payroll, Reports, Settings, LoginPage, Profile } from './pages';

// ================================
// Route table
// Staff-only pages carry `staffOnly`; the API enforces the same rule, so a
// typed URL cannot reveal data either.
// ================================

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />

                            <Route
                                path="/*"
                                element={
                                    <ProtectedRoute>
                                        <AppShell>
                                            <Routes>
                                                <Route path="/" element={<Overview />} />
                                                <Route
                                                    path="/people"
                                                    element={
                                                        <ProtectedRoute staffOnly>
                                                            <People />
                                                        </ProtectedRoute>
                                                    }
                                                />
                                                <Route path="/attendance" element={<TimeLeave />} />
                                                <Route path="/payroll" element={<Payroll />} />
                                                <Route
                                                    path="/reports"
                                                    element={
                                                        <ProtectedRoute staffOnly>
                                                            <Reports />
                                                        </ProtectedRoute>
                                                    }
                                                />
                                                <Route path="/settings" element={<Settings />} />
                                                <Route path="/profile" element={<Profile />} />
                                            </Routes>
                                        </AppShell>
                                    </ProtectedRoute>
                                }
                            />
                        </Routes>
                    </BrowserRouter>
                </AppProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
