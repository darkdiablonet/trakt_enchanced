/**
 * Module de suivi du progrès pour le chargement initial
 */

const activeConnections = new Set();

export function addProgressConnection(res) {
  activeConnections.add(res);
  
  res.on('close', () => {
    activeConnections.delete(res);
  });
}

export function sendProgress(step, status, message = null, progress = null) {
  const data = {
    step,
    status,
    message,
    progress,
    timestamp: new Date().toISOString()
  };
  
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  
  // Envoyer à toutes les connexions actives
  for (const res of activeConnections) {
    try {
      res.write(payload);
    } catch (error) {
      // Connexion fermée, la supprimer
      activeConnections.delete(res);
    }
  }
}

export function sendCompletion() {
  const data = {
    completed: true,
    timestamp: new Date().toISOString()
  };
  
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  
  for (const res of activeConnections) {
    try {
      res.write(payload);
      res.end();
    } catch (error) {
      // Ignoré
    }
  }
  
  activeConnections.clear();
}

export function hasActiveConnections() {
  return activeConnections.size > 0;
}