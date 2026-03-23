// controllers/roundController.js
const prisma = require('../config/db');

exports.getRounds = async (req, res) => {
    try {
        const rounds = await prisma.roundControl.findMany({ orderBy: { roundNumber: 'asc' } });
        res.json({ rounds });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rounds' });
    }
};

exports.toggleRound = async (req, res) => {
    try {
        const { roundNumber } = req.params;
        const roundNum = parseInt(roundNumber);
        const existing = await prisma.roundControl.findUnique({ where: { roundNumber: roundNum } });
        if (!existing) return res.status(404).json({ message: 'Round not found' });

        const updated = await prisma.roundControl.update({
            where: { roundNumber: roundNum },
            data: { isLive: !existing.isLive }
        });

        const io = req.app.get('io');
        if (io) io.emit('roundStatusChanged', { roundNumber: roundNum, isLive: updated.isLive });

        res.json({ round: updated });
    } catch (error) {
        res.status(500).json({ message: 'Error toggling round' });
    }
};
