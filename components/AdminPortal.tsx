
import React, { useState } from 'react';
import { AdminUser } from '../types';
import AdminDashboard from './AdminDashboard';
import AdminLoginScreen from './AdminLoginScreen';
import { auth } from '../services/firebaseConfig';
import { signOut } from 'firebase/auth';

const AdminPortal: React.FC = () => {
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

    const handleLoginSuccess = (user: AdminUser) => {
        setAdminUser(user);
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out admin:", error);
        } finally {
            setAdminUser(null);
        }
    };

    if (!adminUser) {
        return <AdminLoginScreen onLoginSuccess={handleLoginSuccess} />;
    }

    return <AdminDashboard adminUser={adminUser} onLogout={handleLogout} />;
};

export default AdminPortal;