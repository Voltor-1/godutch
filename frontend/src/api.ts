

export function deleteSession(token: string, participantToken: string): Promise<{ deleted: true }> {
  return apiFetch(`/sessions/${token}`, {
    method: 'DELETE',
    body: JSON.stringify({ participantToken }),
  });
}