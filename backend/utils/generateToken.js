import jwt from 'jsonwebtoken'
import 'dotenv/config';

const generateTokenAndSetCookie = (userId, res) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '15d'
    })

    res.cookie("jwt", token, {
        maxAge: 15 * 24 * 60 * 60 * 1000, //millisecond format 15days 24hrs 60min 60sec 1000millisec
        httpOnly: true, //prevent XSS attacks cross-site scripting attacks
        sameSite: "strict", //CSRF attacks cross-site request forgery attacks
        secure: process.env.NODE_ENV === 'production'
    })
    // console.log("Token in generateTokenAndSetCookie: ", token);
}

export default generateTokenAndSetCookie
