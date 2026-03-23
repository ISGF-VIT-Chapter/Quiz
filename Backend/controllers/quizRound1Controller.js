// controllers/quizRound1Controller.js
const prisma = require('../config/db');
const redis = require('../config/redis');

// Helper: get question by index for round 1
async function getQuestionByIndex(index) {
    const orderIndex = index + 1;
    return prisma.question.findFirst({
        where: { roundNumber: 1, orderIndex },
        orderBy: { orderIndex: 'asc' }
    });
}

// POST /api/team/quiz/start
exports.startQuiz = async (req, res) => {
    try {
        const { teamId } = req.user;

        // Check if round 1 is live
        const round = await prisma.roundControl.findUnique({ where: { roundNumber: 1 } });
        if (!round || !round.isLive) {
            return res.status(403).json({ message: 'Round 1 is not currently active.' });
        }

        // Check existing session
        let session = await prisma.quizSession.findUnique({ where: { teamId } });

        if (session && session.completedAt) {
            return res.json({ alreadyCompleted: true, totalScore: session.totalScore });
        }
        if (session && session.isDisqualified) {
            return res.json({ disqualified: true, reason: session.disqualifyReason });
        }

        if (!session) {
            session = await prisma.quizSession.create({
                data: { teamId, currentQuestionIndex: 0 }
            });
        }

        const question = await getQuestionByIndex(session.currentQuestionIndex);
        if (!question) {
            return res.status(500).json({ message: 'No questions found for Round 1.' });
        }

        // Store question start time in Redis
        await redis.set(`quiz:r1:qstart:${teamId}`, Date.now().toString(), 'EX', 120);

        res.json({
            question: {
                id: question.id,
                questionText: question.questionText,
                optionA: question.optionA,
                optionB: question.optionB,
                optionC: question.optionC,
                optionD: question.optionD,
                timeLimitSeconds: question.timeLimitSeconds,
                questionNumber: session.currentQuestionIndex + 1,
                totalQuestions: 10
            }
        });
    } catch (error) {
        console.error('Quiz start error:', error);
        res.status(500).json({ message: 'Error starting quiz' });
    }
};

// POST /api/team/quiz/answer
exports.submitAnswer = async (req, res) => {
    const answerReceivedAt = Date.now(); // CAPTURE IMMEDIATELY

    try {
        const { teamId } = req.user;
        const { questionId, selectedAnswer } = req.body;

        // Rate limiting via Redis
        const rateKey = `quiz:r1:ratelimit:${teamId}`;
        const recentCall = await redis.get(rateKey);
        if (recentCall) return res.status(429).json({ message: 'Too many requests. Please wait.' });
        await redis.set(rateKey, '1', 'PX', 500);

        // Validate session
        const session = await prisma.quizSession.findUnique({ where: { teamId } });
        if (!session) return res.status(400).json({ message: 'No active quiz session.' });
        if (session.completedAt) return res.status(400).json({ message: 'Quiz already completed.' });
        if (session.isDisqualified) return res.status(400).json({ message: 'You have been disqualified.' });

        // Get the expected current question
        const question = await getQuestionByIndex(session.currentQuestionIndex);
        if (!question) return res.status(400).json({ message: 'No current question found.' });
        if (question.id !== questionId) return res.status(400).json({ message: 'Invalid question ID.' });

        // Get question start time
        const qStartRaw = await redis.get(`quiz:r1:qstart:${teamId}`);
        const qStartMs = qStartRaw ? parseInt(qStartRaw) : answerReceivedAt;
        const timeTakenMs = answerReceivedAt - qStartMs;

        // Determine score
        const timeLimitMs = question.timeLimitSeconds * 1000;
        let isCorrect = false;
        let score = 0;

        if (selectedAnswer === 'TIMEOUT' || timeTakenMs > timeLimitMs + 500) {
            isCorrect = false;
            score = 0;
        } else if (selectedAnswer === question.correctAnswer) {
            isCorrect = true;
            const ratio = Math.min(timeTakenMs / timeLimitMs, 1);
            score = parseFloat((10 - ratio * 9 + Math.random() * 0.0001).toFixed(6));
            score = Math.max(1.0001, score);
        } else {
            isCorrect = false;
            score = 0;
        }

        const newIndex = session.currentQuestionIndex + 1;
        await redis.del(`quiz:r1:qstart:${teamId}`);

        if (newIndex >= 10) {
            // Quiz complete — compute total
            const allAttempts = await prisma.quizAttempt.findMany({ where: { teamId } });
            const totalScore = parseFloat((allAttempts.reduce((sum, a) => sum + a.score, 0) + score).toFixed(4));

            await Promise.all([
                prisma.quizAttempt.create({
                    data: { teamId, questionId, selectedAnswer, isCorrect, timeTakenMs, score }
                }),
                prisma.quizSession.update({
                    where: { teamId },
                    data: { currentQuestionIndex: newIndex, completedAt: new Date(), totalScore }
                }),
                prisma.team.update({ where: { id: teamId }, data: { round1Score: totalScore } })
            ]);

            return res.json({ quizComplete: true, totalScore, isCorrect, score });
        }

        // Advance to next question
        const nextQuestionPromise = getQuestionByIndex(newIndex);
        await Promise.all([
            prisma.quizAttempt.create({
                data: { teamId, questionId, selectedAnswer, isCorrect, timeTakenMs, score }
            }),
            prisma.quizSession.update({
                where: { teamId },
                data: { currentQuestionIndex: newIndex }
            })
        ]);

        const nextQuestion = await nextQuestionPromise;
        await redis.set(`quiz:r1:qstart:${teamId}`, Date.now().toString(), 'EX', 120);

        res.json({
            isCorrect,
            score,
            question: {
                id: nextQuestion.id,
                questionText: nextQuestion.questionText,
                optionA: nextQuestion.optionA,
                optionB: nextQuestion.optionB,
                optionC: nextQuestion.optionC,
                optionD: nextQuestion.optionD,
                timeLimitSeconds: nextQuestion.timeLimitSeconds,
                questionNumber: newIndex + 1,
                totalQuestions: 10
            }
        });
    } catch (error) {
        console.error('Quiz answer error:', error);
        res.status(500).json({ message: 'Error submitting answer' });
    }
};

// GET /api/team/quiz/status
exports.getStatus = async (req, res) => {
    try {
        const { teamId } = req.user;
        const session = await prisma.quizSession.findUnique({ where: { teamId } });
        if (!session) return res.json({ started: false });
        res.json({
            started: true,
            completed: !!session.completedAt,
            disqualified: session.isDisqualified,
            disqualifyReason: session.disqualifyReason,
            currentQuestionIndex: session.currentQuestionIndex,
            totalScore: session.totalScore
        });
    } catch (error) {
        res.status(500).json({ message: 'Error getting status' });
    }
};

// POST /api/team/quiz/flag-violation
exports.flagViolation = async (req, res) => {
    try {
        const { teamId } = req.user;
        const { reason } = req.body;

        const countKey = `quiz:r1:violations:${teamId}`;
        const count = await redis.incr(countKey);
        await redis.expire(countKey, 7200); // 2 hour TTL

        const session = await prisma.quizSession.findUnique({ where: { teamId } });
        if (!session || session.completedAt || session.isDisqualified) {
            return res.json({ warned: true, violationCount: count });
        }

        const io = req.app.get('io');

        if (count >= 3) {
            // Auto-submit quiz on third violation
            const allAttempts = await prisma.quizAttempt.findMany({ where: { teamId } });
            const totalScore = parseFloat(allAttempts.reduce((sum, a) => sum + a.score, 0).toFixed(4));

            await prisma.quizSession.update({
                where: { teamId },
                data: { completedAt: new Date(), totalScore }
            });
            await prisma.team.update({ where: { id: teamId }, data: { round1Score: totalScore } });

            const team = await prisma.team.findUnique({ where: { id: teamId }, select: { teamName: true } });
            if (io) io.to('admin').emit('quizViolation', { teamId, teamName: team?.teamName, reason, violationCount: count, autoSubmitted: true });

            return res.json({ autoSubmitted: true, violationCount: count, totalScore });
        }

        const team = await prisma.team.findUnique({ where: { id: teamId }, select: { teamName: true } });
        if (io) io.to('admin').emit('quizViolation', { teamId, teamName: team?.teamName, reason, violationCount: count, disqualified: false });

        res.json({ warned: true, violationCount: count });
    } catch (error) {
        console.error('Violation error:', error);
        res.status(500).json({ message: 'Error flagging violation' });
    }
};

// GET /api/admin/quiz/results
exports.getResults = async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            select: {
                id: true, teamName: true, teamCode: true, round1Score: true,
                quizSession: true,
                quizAttempts: {
                    include: { question: { select: { questionText: true, correctAnswer: true, orderIndex: true } } },
                    orderBy: { question: { orderIndex: 'asc' } }
                }
            },
            orderBy: { round1Score: 'desc' }
        });

        const result = teams.map(t => ({
            teamId: t.id,
            teamName: t.teamName,
            round1Score: t.round1Score,
            session: t.quizSession ? {
                completedAt: t.quizSession.completedAt,
                isDisqualified: t.quizSession.isDisqualified,
                disqualifyReason: t.quizSession.disqualifyReason,
                currentQuestionIndex: t.quizSession.currentQuestionIndex,
                startedAt: t.quizSession.startedAt
            } : null,
            attempts: t.quizAttempts.map(a => ({
                questionId: a.questionId,
                questionText: a.question.questionText,
                selectedAnswer: a.selectedAnswer,
                correctAnswer: a.question.correctAnswer,
                isCorrect: a.isCorrect,
                timeTakenMs: a.timeTakenMs,
                score: a.score
            }))
        }));

        res.json({ teams: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching results' });
    }
};
