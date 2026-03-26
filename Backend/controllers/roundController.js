// controllers/roundController.js
const prisma = require('../config/db');

async function ensureDefaultRounds() {
    await prisma.roundControl.upsert({
        where: { roundNumber: 1 },
        update: {},
        create: { roundNumber: 1, isLive: false }
    });

    await prisma.roundControl.upsert({
        where: { roundNumber: 2 },
        update: {},
        create: { roundNumber: 2, isLive: false }
    });
}

exports.getRounds = async (req, res) => {
    try {
        await ensureDefaultRounds();
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
        if (![1, 2].includes(roundNum)) {
            return res.status(400).json({ message: 'Invalid round number' });
        }

        await ensureDefaultRounds();

        const existing = await prisma.roundControl.findUnique({ where: { roundNumber: roundNum } });

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
