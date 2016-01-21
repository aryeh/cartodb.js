var _ = require('underscore');
var cdb = require('cdb'); // cdb.geo.LeafletMapView, cdb.geo.GoogleMapsMapView
var log = require('cdb.log');
var View = require('../core/view');
var Infowindow = require('./ui/infowindow');
// TODO: var CartoDBLayerGroupNamed = require('../../geo/map/cartodb-layer-group-named');
var CartoDBLayerGroupAnonymous = require('../geo/map/cartodb-layer-group-anonymous');

var MapView = View.extend({

  initialize: function() {

    if (this.options.map === undefined) {
      throw "you should specify a map model";
    }

    this.map = this.options.map;
    this.add_related_model(this.map);
    this.add_related_model(this.map.layers);

    this.autoSaveBounds = false;

    // A map of the LayerView that is linked to each LayerModel
    // TODO: Rename this
    this.layers = {};
    this.geometries = {};

    this.map.layers.bind('add', this._addLayer, this);
    this.map.layers.bind('remove', this._removeLayer, this);
    this.map.layers.bind('reset', this._addLayers, this);
    this.bind('clean', this._removeLayers, this);
  },

  render: function() {
    return this;
  },

  /**
  * add a infowindow to the map
  */
  addInfowindow: function(infoWindowView) {
    this.addOverlay(infoWindowView);
  },

  addOverlay: function(overlay) {
    if (overlay) {
      this.$el.append(overlay.render().el);
      this.addView(overlay);
    }
  },

  /**
  * search in the subviews and return the infowindows
  */
  getInfoWindows: function() {
    var result = [];
    for (var s in this._subviews) {
      if(this._subviews[s] instanceof Infowindow) {
        result.push(this._subviews[s]);
      }
    }
    return result;
  },

  showBounds: function(bounds) {
    throw "to be implemented";
  },

  isMapAlreadyCreated: function() {
    return this.options.map_object;
  },

  setAttribution: function() {
    throw new Error('Subclasses of src/geo/map-view.js must implement .setAttribution');
  },

  /**
  * set model property but unbind changes first in order to not create an infinite loop
  */
  _setModelProperty: function(prop) {
    this._unbindModel();
    this.map.set(prop);
    if(prop.center !== undefined || prop.zoom !== undefined) {
      var b = this.getBounds();
      this.map.set({
        view_bounds_sw: b[0],
        view_bounds_ne: b[1]
      });
      if(this.autoSaveBounds) {
        this._saveLocation();
      }
    }
    this._bindModel();
  },

  /** bind model properties */
  _bindModel: function() {
    this._unbindModel();
    this.map.bind('change:view_bounds_sw',  this._changeBounds, this);
    this.map.bind('change:view_bounds_ne',  this._changeBounds, this);
    this.map.bind('change:zoom',            this._setZoom, this);
    this.map.bind('change:scrollwheel',     this._setScrollWheel, this);
    this.map.bind('change:keyboard',        this._setKeyboard, this);
    this.map.bind('change:center',          this._setCenter, this);
    this.map.bind('change:attribution',     this.setAttribution, this);
  },

  /** unbind model properties */
  _unbindModel: function() {
    this.map.unbind('change:view_bounds_sw',  null, this);
    this.map.unbind('change:view_bounds_ne',  null, this);
    this.map.unbind('change:zoom',            null, this);
    this.map.unbind('change:scrollwheel',     null, this);
    this.map.unbind('change:keyboard',        null, this);
    this.map.unbind('change:center',          null, this);
    this.map.unbind('change:attribution',     null, this);
  },

  _changeBounds: function() {
    var bounds = this.map.getViewBounds();
    if(bounds) {
      this.showBounds(bounds);
    }
  },

  showBounds: function(bounds) {
    this.map.fitBounds(bounds, this.getSize());
  },

  _addLayers: function(layerCollection, options) {
    var self = this;
    this._removeLayers();
    this.map.layers.each(function (layerModel) {
      self._addLayer(layerModel, layerCollection, {
        silent: (options && options.silent) || false,
        index: options && options.index
      });
    });
  },

  _addLayer: function(layerModel, layerCollection, options) {
    var layerView;

    // CartoDBLayers are grouped visually that's why we need an instance of a
    // CartoDBLayerGroupAnonymous or CartoDBLayerGroupNamed
    if (layerModel.get('type') === 'CartoDB') {
      if (!this._cartoDBLayerGroup) {
        this._cartoDBLayerGroup = new CartoDBLayerGroupAnonymous({}, {
          windshaftMap: this.map.windshaftMap,
          layers: [layerModel]
        });
        layerView = this.createLayer(this._cartoDBLayerGroup, this.map_leaflet);
        this.layers[layerModel.cid] = layerView;
      } else {
        // Add that layer to the group
        // TODO: The only reason why the _cartoDBLayerGroup needs to access individual layers
        // is to know if layers are visible of not, so that URLs for attributes can use the
        // right indexes. There should be a better way to do this.
        this._cartoDBLayerGroup.layers.add(layerModel);
        this.layers[layerModel.cid] = this.getLayerByCid(this._cartoDBLayerGroup.layers.at(0).cid);
      }
    } else {
      layerView = this.createLayer(layerModel, this.map_leaflet);
      if (layerView) {
        this.layers[layerModel.cid] = layerView;
      }
    }

    if (!layerView) {
      return;
    }
    this._addLayerToMap(layerView, layerModel, {
      silent: options.silent,
      index: options.index
    });
  },

  _removeLayers: function(layer) {
    for(var i in this.layers) {
      var layerView = this.layers[i];
      layerView.remove();
      delete this.layers[i];
    }
  },

  _removeLayer: function(layerModel) {
    if (layerModel.get('type') === 'CartoDB') {
      this._cartoDBLayerGroup.layers.remove(layerModel);
      if (this._cartoDBLayerGroup.layers.size() === 0) {
        delete this._cartoDBLayerGroup;
      }
    }
    var layerView = this.layers[layerModel.cid];
    if (layerView) {
      layerView.remove();
      delete this.layers[layerModel.cid];
    }
  },

  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    delete this.layers[layer.cid];
  },

  // TODO: Rename to getLayerViewByLayerModelCID
  getLayerByCid: function(cid) {
    var l = this.layers[cid];
    if(!l) {
      log.debug("layer with cid " + cid + " can't be get");
    }
    return l;
  },

  _setZoom: function(model, z) {
    throw "to be implemented";
  },

  _setCenter: function(model, center) {
    throw "to be implemented";
  },

  _addGeomToMap: function(geom) {
    throw "to be implemented";
  },

  _removeGeomFromMap: function(geo) {
    throw "to be implemented";
  },

  createLayer: function() {
    throw "to be implemented";
  },

  _addLayerToMap: function() {
    throw "to be implemented";
  },

  setAutoSaveBounds: function() {
    var self = this;
    this.autoSaveBounds = true;
  },

  _saveLocation: _.debounce(function() {
    this.map.save(null, { silent: true });
  }, 1000),

  _addGeometry: function(geom) {
    var view = this._addGeomToMap(geom);
    this.geometries[geom.cid] = view;
  },

  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    this._removeGeomFromMap(geo_view);
    delete this.geometries[geo.cid];
  }


}, {
  _getClass: function(provider) {
    var mapViewClass = cdb.geo.LeafletMapView;
    if(provider === 'googlemaps') {
      if(typeof(google) != "undefined" && typeof(google.maps) != "undefined") {
        mapViewClass = cdb.geo.GoogleMapsMapView;
      } else {
        log.error("you must include google maps library _before_ include cdb");
      }
    }
    return mapViewClass;
  },

  create: function(el, mapModel) {
    var _mapViewClass = MapView._getClass(mapModel.get('provider'));
    return new _mapViewClass({
      el: el,
      map: mapModel
    });
  }
});

module.exports = MapView;
