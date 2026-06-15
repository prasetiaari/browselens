export type KnowledgeType = 'observation' | 'heuristic' | 'finding' | 'lesson_learned';

export interface KnowledgePayload {
  knowledge_type: KnowledgeType;
  target_domain?: string;
  project_id?: string;
  related_endpoints?: string[];
  content: string; // The actual memory text
  timestamp: number;
}

export class MemoryManager {
  private qdrantUrl: string;
  private collection = 'browselens_knowledge';
  private aiBaseUrl: string;
  private embeddingModel: string;

  constructor(qdrantUrl: string, aiBaseUrl: string, embeddingModel: string) {
    this.qdrantUrl = qdrantUrl.replace(/\/$/, ''); // remove trailing slash
    this.aiBaseUrl = aiBaseUrl.replace(/\/$/, '');
    this.embeddingModel = embeddingModel;
  }

  // Ensure collection exists
  public async initialize(): Promise<void> {
    try {
      const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}`);
      if (!res.ok) {
        // Create collection if it doesn't exist (assuming 768 dim for nomic/bge)
        await fetch(`${this.qdrantUrl}/collections/${this.collection}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: 768, 
              distance: 'Cosine'
            }
          })
        });
      }
    } catch (e) {
      console.error('Failed to initialize Qdrant collection', e);
    }
  }

  // Generate Embedding via LM Studio / OpenAI compatible endpoint
  private async getEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${this.aiBaseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        input: text, 
        model: this.embeddingModel 
      })
    });
    if (!res.ok) {
      throw new Error(`Embedding failed: ${res.statusText}`);
    }
    const data = await res.json();
    return data.data[0].embedding;
  }

  // Storage Workflow (Save Knowledge)
  public async saveKnowledge(payload: KnowledgePayload): Promise<void> {
    await this.initialize();
    const vector = await this.getEmbedding(payload.content);
    const id = crypto.randomUUID();

    const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{
          id,
          vector,
          payload
        }]
      })
    });
    
    if (!res.ok) {
      throw new Error(`Failed to save to Qdrant: ${res.statusText}`);
    }
  }

  // Retrieval Workflow (Query Knowledge)
  public async retrieveRelevantKnowledge(
    currentContext: string, 
    currentDomain: string, 
    projectId: string,
    limit: number = 3
  ): Promise<KnowledgePayload[]> {
    try {
      const vector = await this.getEmbedding(currentContext);

      // Filter: Must match current project, and should match either domain or be a heuristic
      const filter = {
        must: [
          { key: "project_id", match: { value: projectId } }
        ],
        should: [
          { key: "knowledge_type", match: { value: "heuristic" } },
          { key: "target_domain", match: { value: currentDomain } }
        ]
      };

      const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector,
          filter,
          limit,
          with_payload: true
        })
      });

      if (!res.ok) return [];

      const data = await res.json();
      return (data.result || []).map((r: any) => ({ ...r.payload, id: r.id } as KnowledgePayload & { id: string }));
    } catch (e) {
      console.error('Failed to retrieve knowledge from Qdrant', e);
      return [];
    }
  }

  // Get All Knowledge for a specific project
  public async getAllKnowledge(projectId: string): Promise<Array<KnowledgePayload & { id: string }>> {
    try {
      await this.initialize();
      const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [
              { key: "project_id", match: { value: projectId } }
            ]
          },
          limit: 1000,
          with_payload: true,
          with_vector: false
        })
      });

      if (!res.ok) {
        if (res.status === 404) return []; // Collection doesn't exist yet
        throw new Error(`Failed to scroll Qdrant: ${res.statusText}`);
      }

      const data = await res.json();
      return (data.result?.points || []).map((r: any) => ({ ...r.payload, id: r.id } as KnowledgePayload & { id: string }));
    } catch (e) {
      console.error('Failed to get all knowledge from Qdrant', e);
      throw e;
    }
  }

  // Delete Knowledge
  public async deleteKnowledge(pointId: string): Promise<void> {
    const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [pointId]
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to delete from Qdrant: ${res.statusText}`);
    }
  }

  // Update Knowledge (re-embeds the content and overwrites the point)
  public async updateKnowledge(pointId: string, payload: KnowledgePayload): Promise<void> {
    await this.initialize();
    const vector = await this.getEmbedding(payload.content);
    
    const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{
          id: pointId,
          vector,
          payload
        }]
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to update in Qdrant: ${res.statusText}`);
    }
  }
}
