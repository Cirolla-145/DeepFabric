import executeQuery from '../db/runQuery.js';

const userOwnsWorkspace = async (workspaceId, userId) => {
    const rows = await executeQuery(
        'SELECT id FROM workspaces WHERE id = ? AND user_id = ?',
        [workspaceId, userId]
    );
    return rows.length > 0;
};

const userOwnsSubject = async (subjectId, userId) => {
    const rows = await executeQuery(
        `SELECT s.id
         FROM subjects s
         JOIN workspaces w ON w.id = s.workspace_id
         WHERE s.id = ? AND w.user_id = ?`,
        [subjectId, userId]
    );
    return rows.length > 0;
};

export const getWorkspaces = async (req, res) => {
    try {
        const workspaces = await executeQuery(
            `SELECT id, name, description, tags, created_at, updated_at
             FROM workspaces WHERE user_id = ? ORDER BY updated_at DESC, name ASC`,
            [req.user.id]
        );
        return res.status(200).json({ workspaces });
    } catch (error) {
        console.error('Error getting workspaces:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getWorkspaceSubjects = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        if (!(await userOwnsWorkspace(workspaceId, req.user.id))) {
            return res.status(404).json({ message: 'Workspace not found' });
        }
        const subjects = await executeQuery(
            `SELECT id, workspace_id, name, description, tags, created_at, updated_at
             FROM subjects WHERE workspace_id = ? ORDER BY updated_at DESC, name ASC`,
            [workspaceId]
        );
        return res.status(200).json({ subjects });
    } catch (error) {
        console.error('Error getting subjects:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getSubjectModules = async (req, res) => {
    try {
        const { subjectId } = req.params;
        if (!(await userOwnsSubject(subjectId, req.user.id))) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        const modules = await executeQuery(
            `SELECT id, subject_id, name, description, tags, created_at, updated_at
             FROM modules WHERE subject_id = ? ORDER BY updated_at DESC, name ASC`,
            [subjectId]
        );
        return res.status(200).json({ modules });
    } catch (error) {
        console.error('Error getting modules:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModule = async (req, res) => {
    try {
        const { moduleId } = req.params;
        const rows = await executeQuery(
            `SELECT m.id, m.subject_id, m.name, m.description, m.tags, m.created_at, m.updated_at
             FROM modules m
             JOIN subjects s ON s.id = m.subject_id
             JOIN workspaces w ON w.id = s.workspace_id
             WHERE m.id = ? AND w.user_id = ?`,
            [moduleId, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Module not found' });
        return res.status(200).json({ module: rows[0] });
    } catch (error) {
        console.error('Error getting module:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateEntity = async (table, idColumn, id, userId, ownershipCheck, body) => {
    if (!(await ownershipCheck(id, userId))) return null;
    const rows = await executeQuery(`SELECT name, description, tags FROM ${table} WHERE ${idColumn} = ?`, [id]);
    const current = rows[0];
    const { name, description, tags } = body;
    if (name === undefined && description === undefined && tags === undefined) {
        return { error: 'Provide name, description, or tags to update' };
    }
    const next = {
        name: name === undefined ? current.name : name,
        description: description === undefined ? current.description : description,
        tags: tags === undefined
            ? (typeof current.tags === 'string' || current.tags === null ? current.tags : JSON.stringify(current.tags))
            : JSON.stringify(tags)
    };
    if (!next.name?.trim()) return { error: 'name cannot be empty' };
    await executeQuery(
        `UPDATE ${table} SET name = ?, description = ?, tags = ? WHERE ${idColumn} = ?`,
        [next.name, next.description, next.tags, id]
    );
    return { id, ...next, tags: tags === undefined ? current.tags : tags };
};

export const updateWorkspace = async (req, res) => {
    try {
        const result = await updateEntity('workspaces', 'id', req.params.workspaceId, req.user.id, userOwnsWorkspace, req.body);
        if (!result) return res.status(404).json({ message: 'Workspace not found' });
        if (result.error) return res.status(400).json({ message: result.error });
        return res.status(200).json({ message: 'Workspace updated successfully', workspace: result });
    } catch (error) {
        console.error('Error updating workspace:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateSubject = async (req, res) => {
    try {
        const result = await updateEntity('subjects', 'id', req.params.subjectId, req.user.id, userOwnsSubject, req.body);
        if (!result) return res.status(404).json({ message: 'Subject not found' });
        if (result.error) return res.status(400).json({ message: result.error });
        return res.status(200).json({ message: 'Subject updated successfully', subject: result });
    } catch (error) {
        console.error('Error updating subject:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateModule = async (req, res) => {
    try {
        const moduleId = req.params.moduleId;
        const ownershipCheck = async (id, userId) => {
            const rows = await executeQuery(
                `SELECT m.id FROM modules m JOIN subjects s ON s.id = m.subject_id
                 JOIN workspaces w ON w.id = s.workspace_id WHERE m.id = ? AND w.user_id = ?`,
                [id, userId]
            );
            return rows.length > 0;
        };
        const result = await updateEntity('modules', 'id', moduleId, req.user.id, ownershipCheck, req.body);
        if (!result) return res.status(404).json({ message: 'Module not found' });
        if (result.error) return res.status(400).json({ message: result.error });
        return res.status(200).json({ message: 'Module updated successfully', module: result });
    } catch (error) {
        console.error('Error updating module:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createWorkspace = async (req, res) => {
    try {
        const { name, description, tags } = req.body;
        const userId = req.user.id;

        if (!name) {
            return res.status(400).json({ message: 'Workspace name is required' });
        }

        const newWorkspace = await executeQuery(
            'INSERT INTO workspaces (user_id, name, description, tags) VALUES (?, ?, ?, ?)',
            [userId, name, description ?? null, tags ? JSON.stringify(tags) : null]
        );
        return res.status(201).json({ message: 'Workspace created successfully', workspace: newWorkspace });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export const createSubject = async (req, res) => {
    try {
        const { workspace_id, name, description, tags } = req.body;

        if (!workspace_id || !name) {
            return res.status(400).json({
                message: 'workspace_id and name are required'
            });
        }
        if (!(await userOwnsWorkspace(workspace_id, req.user.id))) {
            return res.status(403).json({ message: 'You do not have access to this workspace' });
        }
        
        const newSubject = await executeQuery(
            'INSERT INTO subjects (workspace_id, name, description, tags) VALUES (?, ?, ?, ?)',
            [workspace_id, name, description ?? null, tags ? JSON.stringify(tags) : null]
        );
        return res.status(201).json({ message: 'Subject created successfully', subject: newSubject });
    } catch (error) {
        console.error('Error creating subject:', error.message);
        return res.status(500).json({ message: error.message });
    }
}

export const createModule = async (req, res) => {
    try {
        const { subject_id, name, description, tags } = req.body;

        if (!subject_id || !name) {
            return res.status(400).json({
                message: 'subject_id and name are required'
            });
        }
        if (!(await userOwnsSubject(subject_id, req.user.id))) {
            return res.status(403).json({ message: 'You do not have access to this subject' });
        }
        
        const newModule = await executeQuery(
            'INSERT INTO modules (subject_id, name, description, tags) VALUES (?, ?, ?, ?)',
            [subject_id, name, description ?? null, tags ? JSON.stringify(tags) : null]
        );
        return res.status(201).json({ message: 'module created successfully', module: newModule });
    } catch (error) {
        console.error('Error creating module:', error.message);
        return res.status(500).json({ message: error.message });
    }
}
