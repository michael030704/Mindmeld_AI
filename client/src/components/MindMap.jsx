import React from 'react';
import { AIService } from '../services/AIService';

export default function MindMapView({ notes, mindMap, setMindMap }) {
  React.useEffect(() => {
    if (notes.length > 0) {
      const updatedMindMap = AIService.generateAdvancedMindMap(notes);
      setMindMap(updatedMindMap);
    }
  }, [notes, setMindMap]);

  const renderMindMap = () => {
    if (!mindMap || !mindMap.nodes || mindMap.nodes.length === 0) {
      return <p className="empty-state">Create some notes first to generate a mind map!</p>;
    }

    return (
      <div className="mindmap-container">
        <div className="mindmap-stats">
          <div className="stat">
            <label>Nodes:</label>
            <span>{mindMap.stats?.totalNodes || 0}</span>
          </div>
          <div className="stat">
            <label>Connections:</label>
            <span>{mindMap.stats?.totalConnections || 0}</span>
          </div>
          <div className="stat">
            <label>Clusters:</label>
            <span>{mindMap.stats?.clusterCount || 0}</span>
          </div>
          <div className="stat">
            <label>Density:</label>
            <span>{mindMap.stats?.connectionDensity || '0'}</span>
          </div>
        </div>

        <div className="mindmap-visualization">
          <svg width="100%" height="500" className="mindmap-svg">
            {/* Render connections */}
            {mindMap.connections && mindMap.connections.map((conn, idx) => (
              <line
                key={`conn_${idx}`}
                x1={mindMap.nodes.find(n => n.id === conn.source)?.x || 0}
                y1={mindMap.nodes.find(n => n.id === conn.source)?.y || 0}
                x2={mindMap.nodes.find(n => n.id === conn.target)?.x || 0}
                y2={mindMap.nodes.find(n => n.id === conn.target)?.y || 0}
                stroke="#ddd"
                strokeWidth={conn.width || 1}
                opacity="0.6"
              />
            ))}

            {/* Render nodes */}
            {mindMap.nodes && mindMap.nodes.map(node => (
              <g key={node.id}>
                <circle
                  cx={node.x + 250}
                  cy={node.y + 250}
                  r={node.size || 5}
                  fill={node.color || '#999'}
                  opacity="0.8"
                />
                <text
                  x={node.x + 250}
                  y={node.y + 250}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#333"
                  pointerEvents="none"
                >
                  {node.label?.substring(0, 10)}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="mindmap-clusters">
          <h3>Knowledge Clusters</h3>
          {mindMap.clusters && mindMap.clusters.map((cluster, idx) => (
            <div key={idx} className="cluster-item">
              <div className="cluster-color" style={{ backgroundColor: cluster.color }}></div>
              <div className="cluster-info">
                <h4>{cluster.topic}</h4>
                <p>{cluster.size} notes</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mindmap-view">
      <h2>Mind Map</h2>
      {renderMindMap()}
    </div>
  );
}
