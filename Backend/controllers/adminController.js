// controllers/adminController.js
const prisma = require('../config/db');
const redis = require('../config/redis');
const bcrypt = require('bcryptjs');

// --- Team Management ---

exports.getAllTeams = async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            select: {
                id: true,
                teamName: true,
                teamCode: true,
                rawPassword: true, // Now returning the explicitly naked password stored for admin
                score: true,
                isActive: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ teams });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching teams' });
    }
};

exports.addTeam = async (req, res) => {
    try {
        const { teamName, teamCode, password } = req.body;

        if (!teamName || !teamCode || !password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingTeam = await prisma.team.findUnique({ where: { teamCode } });
        if (existingTeam) return res.status(400).json({ message: 'Team code already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const team = await prisma.team.create({
            data: {
                teamName,
                teamCode,
                password: hashedPassword,
                rawPassword: password,
                score: 0,
                isActive: false
            }
        });

        res.status(201).json({ message: 'Team created', teamId: team.id });
    } catch (error) {
        console.error('Adding team error:', error);
        res.status(500).json({ message: 'Error creating team' });
    }
};

exports.deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.team.delete({ where: { id } });

        // Attempt to remove them from redis too
        try {
            await redis.zrem('quiz:leaderboard', id);
            await redis.del(`team:active:${id}`);
        } catch (err) {
            console.warn('Redis unavailable; skipping cleanup.', err.message);
        }

        // Broadcast removal so the client force-logs out
        const io = req.app.get('io');
        if (io) {
            io.emit('teamRemoved', { teamId: id });
        }

        res.json({ message: 'Team deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting team' });
    }
};

exports.toggleTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const team = await prisma.team.update({
            where: { id },
            data: { isActive }
        });

        // Broadcast via socketio
        const io = req.app.get('io');
        if (io) {
            io.emit('teamStatusChanged', { teamId: team.id, isActive: team.isActive });
        }

        res.json({ message: 'Team status updated', team });
    } catch (error) {
        res.status(500).json({ message: 'Error updating team status' });
    }
};

exports.updateTeamScore = async (req, res) => {
    try {
        const { id } = req.params;
        const { delta, questionNumber, roundNumber } = req.body;
        if (typeof delta !== 'number') return res.status(400).json({ message: 'delta must be a number' });
        const qNumValue = Number.isFinite(parseInt(questionNumber, 10)) ? parseInt(questionNumber, 10) : null;
        const roundValue = Number.isFinite(parseInt(roundNumber, 10)) ? parseInt(roundNumber, 10) : 2;

        const team = await prisma.team.findUnique({ where: { id } });
        if (!team) return res.status(404).json({ message: 'Team not found' });

        const updatedTeam = await prisma.team.update({
            where: { id },
            data: { score: Math.max(0, team.score + delta) }
        });

        if (qNumValue !== null) {
            await prisma.scoreLog.create({
                data: {
                    teamId: id,
                    roundNumber: roundValue,
                    questionNumber: qNumValue,
                    points: delta
                }
            });
        }

        const io = req.app.get('io');
        if (io) io.emit('scoreUpdate', { teamId: id, newScore: updatedTeam.score });

        res.json({ message: 'Score updated', team: updatedTeam });
    } catch (error) {
        res.status(500).json({ message: 'Error updating score' });
    }
};

exports.forceLogoutTeam = async (req, res) => {
    try {
        const { id } = req.params;

        const team = await prisma.team.findUnique({ where: { id } });
        if (!team) return res.status(404).json({ message: 'Team not found' });

        await prisma.team.update({
            where: { id },
            data: { isActive: false }
        });

        try {
            await redis.del(`team:active:${id}`);
        } catch (err) {
            console.warn('Redis unavailable; skipping active cleanup.', err.message);
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('teamRemoved', { teamId: id });
            io.emit('teamStatusChanged', { teamId: id, isActive: false });
        }

        res.json({ message: 'Team logged out' });
    } catch (error) {
        res.status(500).json({ message: 'Error logging out team' });
    }
};
