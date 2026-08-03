import express from 'express';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import cors from 'cors';
import authRoutes from './routes/auth_routes.js';
import contentRoutes from './routes/content_routes.js';
import learningRoutes from './routes/learning_routes.js';

const app = express();
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
const port = 4000;

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/learning', learningRoutes);

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

export default app;
