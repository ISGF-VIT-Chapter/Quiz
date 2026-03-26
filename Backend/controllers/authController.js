// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const redis = require('../config/redis');

// --- ADMIN AUTH ---

exports.loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await prisma.adminUser.findUnique({
            where: { username }
        });

        if (admin && (await bcrypt.compare(password, admin.password))) {
            const token = jwt.sign(
                { userId: admin.id, role: admin.role },
                process.env.ADMIN_JWT_SECRET,
                { expiresIn: '12h' }
            );

            res.json({
                message: 'Admin login successful',
                token,
                user: {
                    id: admin.id,
                    username: admin.username,
                    role: admin.role
                }
            });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error("Admin Login Error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// --- TEAM AUTH ---

exports.loginTeam = async (req, res) => {
    try {
        const { teamCode, password } = req.body;

        const team = await prisma.team.findUnique({
            where: { teamCode }
        });

        if (!team) {
            return res.status(401).json({ message: 'Invalid Team Code or Password' });
        }

        if (await bcrypt.compare(password, team.password)) {

            // Track active sessions for this team
            const activeKey = `team:active:${team.id}`;
            try {
                const activeCount = await redis.incr(activeKey);
                if (activeCount === 1) {
                    await prisma.team.update({
                        where: { id: team.id },
                        data: { isActive: true }
                    });
                }
            } catch (err) {
                console.warn('Redis unavailable during login; skipping active count.', err.message);
            }

            const token = jwt.sign(
                { teamId: team.id, teamCode: team.teamCode, role: 'participant' },
                process.env.JWT_SECRET,
                { expiresIn: '12h' }
            );

            // We should broadcast this to admin via socket from the route when possible,
            // or from the frontend once it connects to the socket with the team token.

            res.status(200).json({
                message: 'Login successful',
                token,
                team: {
                    id: team.id,
                    teamName: team.teamName,
                    teamCode: team.teamCode
                }
            });
        } else {
            res.status(401).json({ message: 'Invalid Team Code or Password' });
        }
    } catch (error) {
        console.error("Team Login Error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.logoutTeam = async (req, res) => {
    try {
        const { teamId } = req.user; // from protectTeam middleware

        const activeKey = `team:active:${teamId}`;
        try {
            const activeCount = await redis.decr(activeKey);
            if (activeCount <= 0) {
                await redis.del(activeKey);
                await prisma.team.update({
                    where: { id: teamId },
                    data: { isActive: false }
                });
            }
        } catch (err) {
            console.warn('Redis unavailable during logout; skipping active count.', err.message);
        }

        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        console.error("Team Logout Error:", error);
        res.status(500).json({ message: 'Server error during logout' });
    }
};

// POST /api/team/logout/beacon (token in body for sendBeacon)
exports.logoutTeamBeacon = async (req, res) => {
    try {
        const token = req.body?.token;
        if (!token) return res.status(200).json({ message: 'Logout skipped' });

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(200).json({ message: 'Logout skipped' });
        }

        if (decoded.role !== 'participant') {
            return res.status(200).json({ message: 'Logout skipped' });
        }

        const teamId = decoded.teamId;
        const activeKey = `team:active:${teamId}`;
        try {
            const activeCount = await redis.decr(activeKey);
            if (activeCount <= 0) {
                await redis.del(activeKey);
                await prisma.team.update({
                    where: { id: teamId },
                    data: { isActive: false }
                });
            }
        } catch (err) {
            console.warn('Redis unavailable during beacon logout; skipping active count.', err.message);
        }

        return res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Team Beacon Logout Error:', error);
        return res.status(200).json({ message: 'Logout skipped' });
    }
};
