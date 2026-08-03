import jwt from "jsonwebtoken";
import 'dotenv/config';
import executeQuery from "../db/runQuery.js";

const protectRoute = async (req, res, next) => {
    try {
        const token = req.cookies.jwt;
        // console.log("Token in protectRoute middleware: ", token);
        if (!token) {
            return res.status(401).json({ error: "Unauthorized - No Token Provided" });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded) {
            return res.status(401).json({ error: "Unauthorized - Invalid Token" });
        }

        const user = await executeQuery('SELECT * FROM users WHERE id = ?', [decoded.userId]);

        if (!user.length) {
            return res.status(404).json({ error: "User not found" });
        }

        req.user = user[0];

        next();
    } catch (error) {
        console.log("Error in protectRoute middleware: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

export default protectRoute;
