import bcrypt from 'bcryptjs';
import executeQuery from '../db/runQuery.js';
import generateTokenAndSetCookie from '../utils/generateToken.js';

const searchUser = async (email) => {
  const user = await executeQuery('SELECT * FROM users WHERE email = ?', [email]);
  return user;
};

export const signup = async (req, res) => {
    try {
        const {username, email, password} = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const user = await searchUser(email);
        if (user.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt)
        const newUser = await executeQuery('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}


export const login = async (req, res) => {
    try {
        const {email, password} = req.body;
        const user = await searchUser(email);
        if (user.length === 0) {
            return res.status(400).json({ message: 'User not found' });
        }
        const isPasswordCorrect = await bcrypt.compare(password, user[0].password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: 'Invalid password' });
        }
        generateTokenAndSetCookie(user[0].id, res);
        res.status(200).json({
            message: 'Login successful',
            user: { id: user[0].id, name: user[0].name, email: user[0].email }
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const logout = async (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const getCurrentUser = async (req, res) => {
    return res.status(200).json({
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email
        }
    });
};
