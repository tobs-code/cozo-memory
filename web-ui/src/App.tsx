import React, { useState, useEffect } from 'react';
import { 
  Box, 
  CssBaseline, 
  Drawer, 
  AppBar, 
  Toolbar, 
  List, 
  Typography, 
  Divider, 
  IconButton, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText,
  Container,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  CircularProgress
} from '@mui/material';
import {
  LayoutDashboard as DashboardIcon,
  Users as PeopleIcon,
  Share2 as ShareIcon,
  Search as SearchIcon,
  Plus as AddIcon,
  Database as DatabaseIcon,
  History as HistoryIcon,
  Trash2 as DeleteIcon
} from 'lucide-react';
import axios from 'axios';
import ForceGraph2D from 'react-force-graph-2d';

const drawerWidth = 240;
const API_BASE = 'http://localhost:3001/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entities, setEntities] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [snapshots, setSnapshots] = useState<any[]>([]);

  // Dialog states
  const [openEntityDialog, setOpenEntityDialog] = useState(false);
  const [newEntity, setNewEntity] = useState({ name: '', type: '', metadata: '' });
  const [openObsDialog, setOpenObsDialog] = useState(false);
  const [newObs, setNewObs] = useState({ entity_id: '', text: '', metadata: '' });
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [openDetailDialog, setOpenDetailDialog] = useState(false);

  useEffect(() => {
    fetchHealth();
    fetchEntities();
    if (activeTab === 'graph') fetchGraphData();
    if (activeTab === 'history') fetchSnapshots();
  }, [activeTab]);

  const fetchHealth = async () => {
    try {
      const res = await axios.get(`${API_BASE}/health`);
      setHealth(res.data);
    } catch (err) {
      console.error('Error fetching health:', err);
    }
  };

  const fetchEntities = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/entities`);
      setEntities(res.data);
    } catch (err) {
      console.error('Error fetching entities:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGraphData = async () => {
    setLoading(true);
    try {
      const resEntities = await axios.get(`${API_BASE}/entities`);
      const nodes = resEntities.data.map((e: any) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        val: 5
      }));

      // For simplicity, we'll fetch all relations for all entities
      // In a real app, this should be more efficient
      const links: any[] = [];
      for (const node of nodes) {
        const resDetail = await axios.get(`${API_BASE}/entities/${node.id}`);
        resDetail.data.relations.forEach((rel: any) => {
          if (rel.direction === 'outgoing') {
            links.push({
              source: node.id,
              target: rel.target_id,
              label: rel.type
            });
          }
        });
      }
      setGraphData({ nodes, links });
    } catch (err) {
      console.error('Error fetching graph data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/search`, { params: { query: searchQuery } });
      setSearchResults(res.data);
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/snapshots`);
      setSnapshots(res.data);
    } catch (err) {
      console.error('Error fetching snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/snapshots`, { metadata: { created_via: 'web-ui' } });
      fetchSnapshots();
    } catch (err) {
      console.error('Error creating snapshot:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntityDetails = async (id: string) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/entities/${id}`);
      setSelectedEntity(res.data);
      setOpenDetailDialog(true);
    } catch (err) {
      console.error('Error fetching entity details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddObservation = async () => {
    try {
      let metadata = {};
      try { metadata = JSON.parse(newObs.metadata || '{}'); } catch(e) {}
      await axios.post(`${API_BASE}/observations`, { ...newObs, metadata });
      setOpenObsDialog(false);
      setNewObs({ entity_id: '', text: '', metadata: '' });
      if (selectedEntity?.entity.id === newObs.entity_id) {
        fetchEntityDetails(newObs.entity_id);
      }
      fetchHealth();
    } catch (err) {
      console.error('Error adding observation:', err);
    }
  };

  const handleCreateEntity = async () => {
    try {
      let metadata = {};
      try { metadata = JSON.parse(newEntity.metadata || '{}'); } catch(e) {}
      await axios.post(`${API_BASE}/entities`, { ...newEntity, metadata });
      setOpenEntityDialog(false);
      setNewEntity({ name: '', type: '', metadata: '' });
      fetchEntities();
      fetchHealth();
    } catch (err) {
      console.error('Error creating entity:', err);
    }
  };

  const handleDeleteEntity = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this entity?')) return;
    try {
      await axios.delete(`${API_BASE}/entities/${id}`);
      fetchEntities();
      fetchHealth();
    } catch (err) {
      console.error('Error deleting entity:', err);
    }
  };

  const renderDashboard = () => (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Entities</Typography>
            <Typography variant="h3">{health?.entities || 0}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Observations</Typography>
            <Typography variant="h3">{health?.observations || 0}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Relationships</Typography>
            <Typography variant="h3">{health?.relationships || 0}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Recent Entities</Typography>
          <List>
            {entities.slice(0, 5).map((entity) => (
              <ListItem key={entity.id}>
                <ListItemText 
                  primary={entity.name} 
                  secondary={`${entity.type} • ${new Date(entity.created_at).toLocaleString()}`} 
                />
                <Chip label={entity.type} size="small" />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Grid>
    </Grid>
  );

  const renderEntities = () => (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">Entities</Typography>
        <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={() => setOpenEntityDialog(true)}>
          New Entity
        </Button>
      </Box>
      <Paper>
        <List>
          {entities.map((entity) => (
            <React.Fragment key={entity.id}>
              <ListItem
                disablePadding
                secondaryAction={
                  <IconButton edge="end" aria-label="delete" onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteEntity(entity.id);
                  }}>
                    <DeleteIcon size={20} />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => fetchEntityDetails(entity.id)}>
                  <ListItemText 
                    primary={entity.name} 
                    secondary={entity.id} 
                  />
                  <Box sx={{ mr: 4 }}>
                    <Chip label={entity.type} color="primary" variant="outlined" sx={{ mr: 1 }} />
                    <Typography variant="caption" color="textSecondary">
                      {new Date(entity.created_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                </ListItemButton>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      </Paper>

      {/* Entity Detail Dialog */}
      <Dialog open={openDetailDialog} onClose={() => setOpenDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">{selectedEntity?.entity.name}</Typography>
            <Typography variant="caption" color="textSecondary">{selectedEntity?.entity.id}</Typography>
          </Box>
          <Chip label={selectedEntity?.entity.type} color="primary" />
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">Observations</Typography>
              <Button 
                size="small" 
                startIcon={<AddIcon size={16} />} 
                onClick={() => {
                  setNewObs({ ...newObs, entity_id: selectedEntity.entity.id });
                  setOpenObsDialog(true);
                }}
                sx={{ mb: 1 }}
              >
                Add Observation
              </Button>
              <List dense>
                {selectedEntity?.observations.map((obs: any) => (
                  <ListItem key={obs.id}>
                    <ListItemText 
                      primary={obs.text} 
                      secondary={new Date(obs.created_at).toLocaleString()} 
                    />
                  </ListItem>
                ))}
              </List>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">Relations</Typography>
              <List dense>
                {selectedEntity?.relations.map((rel: any, idx: number) => (
                  <ListItem key={idx}>
                    <ListItemText 
                      primary={`${rel.direction === 'outgoing' ? '→' : '←'} ${rel.type}`} 
                      secondary={rel.target_id} 
                    />
                    <Chip label={rel.strength.toFixed(2)} size="small" sx={{ ml: 1 }} />
                  </ListItem>
                ))}
              </List>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetailDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add Observation Dialog */}
      <Dialog open={openObsDialog} onClose={() => setOpenObsDialog(false)}>
        <DialogTitle>Add Observation</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Observation Text"
              fullWidth
              multiline
              rows={4}
              value={newObs.text}
              onChange={(e) => setNewObs({ ...newObs, text: e.target.value })}
            />
            <TextField
              label="Metadata (JSON string)"
              fullWidth
              placeholder='{"key": "value"}'
              value={newObs.metadata}
              onChange={(e) => setNewObs({ ...newObs, metadata: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenObsDialog(false)}>Cancel</Button>
          <Button onClick={handleAddObservation} variant="contained" disabled={!newObs.text}>
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Entity Dialog */}
      <Dialog open={openEntityDialog} onClose={() => setOpenEntityDialog(false)}>
        <DialogTitle>Create New Entity</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={newEntity.name}
              onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
            />
            <TextField
              label="Type (e.g. person, place, concept)"
              fullWidth
              value={newEntity.type}
              onChange={(e) => setNewEntity({ ...newEntity, type: e.target.value })}
            />
            <TextField
              label="Metadata (JSON string)"
              fullWidth
              multiline
              rows={3}
              placeholder='{"key": "value"}'
              value={newEntity.metadata}
              onChange={(e) => setNewEntity({ ...newEntity, metadata: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEntityDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateEntity} variant="contained" disabled={!newEntity.name || !newEntity.type}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  const renderSearch = () => (
    <Box>
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2 }}>
        <TextField 
          fullWidth 
          label="Search Memory (Vector + Keyword)" 
          variant="outlined" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button variant="contained" onClick={handleSearch} disabled={loading}>
          {loading ? <CircularProgress size={24} /> : <SearchIcon />}
        </Button>
      </Paper>
      
      {searchResults.length > 0 && (
        <List>
          {searchResults.map((result, idx) => (
            <Card key={idx} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {result.name || result.text}
                  </Typography>
                  <Chip label={result.source} size="small" color="secondary" />
                </Box>
                <Typography variant="body2" color="textSecondary">
                  Score: {result.score.toFixed(4)} • Type: {result.type}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </List>
      )}
    </Box>
  );

  const renderGraph = () => (
    <Box sx={{ height: '70vh', border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
      <ForceGraph2D
        graphData={graphData}
        nodeLabel="name"
        nodeAutoColorBy="type"
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        linkLabel="label"
        onNodeClick={(node: any) => fetchEntityDetails(node.id)}
      />
    </Box>
  );

  const renderSnapshots = () => (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">Snapshots</Typography>
        <Button 
          variant="contained" 
          startIcon={<HistoryIcon size={18} />} 
          onClick={handleCreateSnapshot}
          disabled={loading}
        >
          Create Snapshot
        </Button>
      </Box>
      <Paper>
        <List>
          {snapshots.map((snap) => (
            <React.Fragment key={snap.snapshot_id}>
              <ListItem>
                <ListItemText 
                  primary={`Snapshot ${snap.snapshot_id.substring(0, 8)}...`} 
                  secondary={new Date(snap.created_at).toLocaleString()} 
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip label={`${snap.entity_count} Entities`} size="small" variant="outlined" />
                  <Chip label={`${snap.observation_count} Obs`} size="small" variant="outlined" />
                  <Chip label={`${snap.relation_count} Rel`} size="small" variant="outlined" />
                </Box>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
          {snapshots.length === 0 && (
            <ListItem>
              <ListItemText primary="No snapshots found" />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <DatabaseIcon style={{ marginRight: 16 }} />
          <Typography variant="h6" noWrap component="div">
            Cozo Memory Explorer
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {[
              { id: 'dashboard', text: 'Dashboard', icon: <DashboardIcon size={20} /> },
              { id: 'entities', text: 'Entities', icon: <PeopleIcon size={20} /> },
              { id: 'graph', text: 'Knowledge Graph', icon: <ShareIcon size={20} /> },
              { id: 'search', text: 'Search', icon: <SearchIcon size={20} /> },
              { id: 'history', text: 'Snapshots', icon: <HistoryIcon size={20} /> },
            ].map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton 
                  selected={activeTab === item.id}
                  onClick={() => setActiveTab(item.id)}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Container maxWidth="lg">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'entities' && renderEntities()}
          {activeTab === 'search' && renderSearch()}
          {activeTab === 'graph' && renderGraph()}
          {activeTab === 'history' && renderSnapshots()}
        </Container>
      </Box>
    </Box>
  );
}

export default App;
