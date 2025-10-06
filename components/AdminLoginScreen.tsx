import React, { useState } from 'react';
import { AdminUser } from '../types';
import Icon from './Icon';
import { firebaseService } from '../services/firebaseService';

interface AdminLoginScreenProps {
  onLoginSuccess: (user: AdminUser) => void;
}

const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const user = await firebaseService.adminLogin(email, password);
      // The new adminLogin handles full authentication and authorization.
      // If it returns a user, login is successful.
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-100 p-4">
       <a href="/#/" className="absolute top-4 left-4 flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <Icon name="back" className="w-5 h-5"/>
            <span>Back to Main Site</span>
        </a>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Icon name="lock-closed" className="w-16 h-16 mx-auto text-sky-500 mb-4" />
          <h1 className="text-3xl font-bold">Admin Portal</h1>
          <p className="text-slate-400">Please authenticate to continue.</p>
        </div>

        <div className="bg-slate-800/50 p-8 rounded-lg border border-slate-700">
          <h2 className="text-xl font-semibold text-center text-sky-400 mb-6">Administrator Login</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block mb-2 text-sm font-medium text-slate-300">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-700 border border-slate-600 text-slate-100 text-base rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2.5 transition"
              />
            </div>
            <div>
              <label htmlFor="password" className="block mb-2 text-sm font-medium text-slate-300">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-700 border border-slate-600 text-slate-100 text-base rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2.5 transition"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
            >
              {isLoading ? 'Processing...' : 'Sign In'}
            </button>
          </form>
        </div>
         <p className="text-xs text-slate-500 mt-4 text-center">
            Note: Admin accounts must be created manually in the Firebase console for security.
        </p>
      </div>
    </div>
  );
};

export default AdminLoginScreen;